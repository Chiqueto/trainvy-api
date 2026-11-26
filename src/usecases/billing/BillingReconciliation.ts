import { buildSubscriptionCheckoutExternalReference, parseDueDateUtc } from "../../domain/billing.js";
import { prisma } from "../../lib/db.js";
import { AsaasClient, type AsaasPaymentDetails } from "../../services/AsaasClient.js";
import { logAsaasError } from "../../services/AsaasErrorLogger.js";
import { DowngradeCoachSubscription } from "./DowngradeCoachSubscription.js";
import { ProcessAsaasWebhook } from "./ProcessAsaasWebhook.js";
import { applyPaidUpgradePayment } from "./UpgradeCoachSubscription.js";

function statusRank(status: string | null | undefined): number {
  switch (status?.toUpperCase()) {
    case "RECEIVED":
      return 1;
    case "CONFIRMED":
      return 2;
    case "OVERDUE":
      return 3;
    case "PENDING":
    case "CREATED":
      return 4;
    default:
      return 99;
  }
}

function mapPaymentStatusToEvent(status: string | null | undefined): string | null {
  switch (status?.toUpperCase()) {
    case "PENDING":
    case "CREATED":
      return "PAYMENT_CREATED";
    case "CONFIRMED":
      return "PAYMENT_CONFIRMED";
    case "RECEIVED":
      return "PAYMENT_RECEIVED";
    case "OVERDUE":
      return "PAYMENT_OVERDUE";
    case "REFUNDED":
      return "PAYMENT_REFUNDED";
    case "CHARGEBACK_REQUESTED":
      return "PAYMENT_CHARGEBACK_REQUESTED";
    case "CHARGEBACK_DISPUTE":
      return "PAYMENT_CHARGEBACK_DISPUTE";
    case "CHARGEBACK":
      return "PAYMENT_CHARGEBACK";
    case "DELETED":
    case "CANCELED":
      return "PAYMENT_DELETED";
    default:
      return null;
  }
}

export class BillingReconciliation {
  private readonly webhookProcessor: ProcessAsaasWebhook;
  private readonly downgradeService: DowngradeCoachSubscription;

  constructor(private readonly asaasClient = new AsaasClient()) {
    this.webhookProcessor = new ProcessAsaasWebhook(asaasClient);
    this.downgradeService = new DowngradeCoachSubscription(asaasClient);
  }

  async run(options?: { pendingLookbackHours?: number; batchSize?: number }) {
    const pendingLookbackHours = options?.pendingLookbackHours ?? 72;
    const batchSize = options?.batchSize ?? 50;
    const now = new Date();

    const summary = {
      pendingSubscriptionsChecked: 0,
      activePaymentsChecked: 0,
      expiredAccessChecked: 0,
      upgradesReconciled: 0,
      downgradesReconciled: 0,
    };

    // 1. Assinaturas com checkout pendente recente
    const lookbackSince = new Date(
      now.getTime() - pendingLookbackHours * 60 * 60 * 1000,
    );
    const pendingSubs = await prisma.subscription.findMany({
      where: {
        billingProvider: "ASAAS",
        status: { in: ["PENDING", "TRIALING"] },
        payments: {
          some: {
            createdAt: { gte: lookbackSince },
            status: { in: ["CREATED", "PENDING"] },
          },
        },
      },
      include: {
        payments: {
          where: { createdAt: { gte: lookbackSince } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      take: batchSize,
    });

    for (const sub of pendingSubs) {
      summary.pendingSubscriptionsChecked++;
      try {
        await this.reconcileSubscription(sub, sub.payments[0]?.planId ?? sub.planId);
      } catch (error) {
        await logAsaasError({
          processName: "BillingReconciliation.pendingSubscription",
          error,
          userId: sub.userId,
          subscriptionId: sub.id,
        });
      }
    }

    // 2. Pagamentos ativos não terminais com providerPaymentId
    const activePayments = await prisma.subscriptionPayment.findMany({
      where: {
        provider: "ASAAS",
        providerPaymentId: { not: null },
        status: { in: ["CREATED", "PENDING", "CONFIRMED", "OVERDUE"] },
      },
      take: batchSize,
    });

    for (const payment of activePayments) {
      summary.activePaymentsChecked++;
      try {
        if (!payment.providerPaymentId) continue;
        const details = await this.asaasClient.getPayment(
          payment.providerPaymentId,
          { subscriptionId: payment.subscriptionId },
        );
        if (details) {
          await this.applySyntheticEvent(details, payment.subscriptionId);
        }
      } catch (error) {
        await logAsaasError({
          processName: "BillingReconciliation.activePayment",
          error,
          subscriptionId: payment.subscriptionId,
        });
      }
    }

    // 3. Acessos expirados ou em grace period vencido
    const expiringSubs = await prisma.subscription.findMany({
      where: {
        billingProvider: "ASAAS",
        status: { in: ["ACTIVE", "PAST_DUE"] },
        OR: [
          { paidUntil: { lt: now } },
          { graceUntil: { lt: now } },
        ],
      },
      take: batchSize,
    });

    for (const sub of expiringSubs) {
      summary.expiredAccessChecked++;
      try {
        await this.reconcileSubscription(sub, sub.planId);
      } catch (error) {
        await logAsaasError({
          processName: "BillingReconciliation.expiredAccess",
          error,
          userId: sub.userId,
          subscriptionId: sub.id,
        });
      }
    }

    // 4. Upgrades pendentes / aguardando sync
    const pendingUpgrades = await prisma.subscriptionUpgrade.findMany({
      where: {
        status: { in: ["PENDING_PAYMENT", "PAID_PENDING_PROVIDER_SYNC"] },
      },
      include: { subscription: true },
      take: batchSize,
    });

    for (const upgrade of pendingUpgrades) {
      summary.upgradesReconciled++;
      try {
        if (upgrade.status === "PAID_PENDING_PROVIDER_SYNC") {
          await applyPaidUpgradePayment(
            upgrade.id,
            "RECONCILIATION_RETRY",
            this.asaasClient,
          );
          continue;
        }

        const recovered = await this.asaasClient.listPaymentsByExternalReference(
          upgrade.externalReference,
          {
            userId: upgrade.subscription.userId,
            subscriptionId: upgrade.subscriptionId,
          },
        );
        const paid = recovered.find((p) =>
          ["CONFIRMED", "RECEIVED"].includes(p.status?.toUpperCase() ?? ""),
        );
        if (paid) {
          await this.webhookProcessor.execute(
            {
              event:
                paid.status?.toUpperCase() === "RECEIVED"
                  ? "PAYMENT_RECEIVED"
                  : "PAYMENT_CONFIRMED",
              payment: paid,
            },
            {
              source: "ASAAS_RECONCILIATION",
              customIdempotencyKey: `ASAAS_RECONCILIATION:UPGRADE:${paid.id}:${paid.status}`,
            },
          );
        } else if (upgrade.expiresAt < now) {
          await prisma.subscriptionUpgrade.update({
            where: { id: upgrade.id },
            data: { status: "EXPIRED", cancelledAt: now },
          });
        }
      } catch (error) {
        await logAsaasError({
          processName: "BillingReconciliation.upgrade",
          error,
          userId: upgrade.subscription.userId,
          subscriptionId: upgrade.subscriptionId,
          externalReference: upgrade.externalReference,
        });
      }
    }

    // 5. Downgrades agendados vencidos ou pendentes de sync/reversão
    const dueDowngrades = await prisma.subscriptionDowngrade.findMany({
      where: {
        OR: [
          { status: "SCHEDULED", effectiveAt: { lte: now } },
          {
            status: { in: ["SCHEDULED", "APPLIED"] },
            asaasSyncStatus: { in: ["PENDING_RETRY", "FAILED"] },
          },
          {
            status: "CANCELLED",
            asaasReversalStatus: { in: ["PENDING_RETRY", "FAILED"] },
          },
        ],
      },
      take: batchSize,
    });

    for (const dg of dueDowngrades) {
      summary.downgradesReconciled++;
      try {
        if (dg.status === "SCHEDULED" && dg.effectiveAt <= now) {
          await this.downgradeService.applyScheduledDowngrade(dg.id);
        } else if (
          ["SCHEDULED", "APPLIED"].includes(dg.status) &&
          ["PENDING_RETRY", "FAILED"].includes(dg.asaasSyncStatus)
        ) {
          await this.downgradeService.executeAsaasSync(dg.id);
        } else if (
          dg.status === "CANCELLED" &&
          dg.asaasReversalStatus &&
          ["PENDING_RETRY", "FAILED"].includes(dg.asaasReversalStatus)
        ) {
          await this.downgradeService.executeAsaasReversal(dg.id);
        }
      } catch (error) {
        await logAsaasError({
          processName: "BillingReconciliation.downgrade",
          error,
          subscriptionId: dg.subscriptionId,
        });
      }
    }

    return summary;
  }

  private async reconcileSubscription(
    sub: {
      id: string;
      userId: string;
      externalSubscriptionId: string | null;
      status: string;
      nextDueDate: Date | null;
    },
    checkoutPlanId: string,
  ) {
    const payments = sub.externalSubscriptionId
      ? await this.asaasClient.listPaymentsBySubscription(
          sub.externalSubscriptionId,
          { userId: sub.userId, subscriptionId: sub.id },
        )
      : await this.asaasClient.listPaymentsByExternalReference(
          buildSubscriptionCheckoutExternalReference(sub.id, checkoutPlanId),
          { userId: sub.userId, subscriptionId: sub.id },
        );

    if (payments.length === 0) return;

    const relevant = [...payments].sort((a, b) => {
      const rankDiff = statusRank(a.status) - statusRank(b.status);
      if (rankDiff !== 0) return rankDiff;
      return (b.dueDate ?? "").localeCompare(a.dueDate ?? "");
    })[0];

    if (relevant) {
      await this.applySyntheticEvent(relevant, sub.id, sub);
    }
  }

  private async applySyntheticEvent(
    asaasPayment: AsaasPaymentDetails,
    subscriptionId: string,
    subSnapshot?: { status: string; nextDueDate: Date | null },
  ) {
    const eventType = mapPaymentStatusToEvent(asaasPayment.status);
    if (!eventType) return;

    if (
      subSnapshot?.status === "ACTIVE" &&
      (eventType === "PAYMENT_OVERDUE" || eventType === "PAYMENT_CREATED")
    ) {
      const due = parseDueDateUtc(asaasPayment.dueDate);
      if (due && subSnapshot.nextDueDate && due < subSnapshot.nextDueDate) {
        return;
      }
    }

    await this.webhookProcessor.execute(
      {
        event: eventType,
        payment: asaasPayment,
      },
      {
        source: "ASAAS_RECONCILIATION",
        customIdempotencyKey: `ASAAS_RECONCILIATION:${eventType}:${asaasPayment.id}:${asaasPayment.status ?? "UNKNOWN"}`,
      },
    );
  }
}
