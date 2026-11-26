import { randomUUID } from "node:crypto";

import {
  addUtcDays,
  BillingError,
  CANCELLED_PAYMENT_STATUSES,
  hasPendingBillingTransition,
  logBillingAccessChange,
  PAID_PAYMENT_STATUSES,
} from "../../domain/billing.js";
import { prisma } from "../../lib/db.js";
import { AsaasClient } from "../../services/AsaasClient.js";

export async function applyPaidUpgradePayment(
  upgradeId: string,
  event: string,
  asaasClient = new AsaasClient(),
) {
  const now = new Date();
  const prep = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "subscription_upgrades" WHERE id = ${upgradeId} FOR UPDATE`;
    const upgrade = await tx.subscriptionUpgrade.findUnique({
      where: { id: upgradeId },
      include: {
        subscription: true,
        targetPlan: true,
      },
    });
    if (!upgrade) return null;

    if (upgrade.status === "APPLIED") {
      return { alreadyDone: true as const, upgrade };
    }
    if (upgrade.status === "CANCELLED") {
      return { cancelled: true as const, upgrade };
    }

    if (
      ["PENDING_PAYMENT", "EXPIRED", "FAILED"].includes(upgrade.status)
    ) {
      await tx.subscriptionUpgrade.update({
        where: { id: upgrade.id },
        data: { paidAt: now },
      });

      await tx.subscription.update({
        where: { id: upgrade.subscriptionId },
        data: {
          planId: upgrade.targetPlanId,
          priceInCentsSnapshot: upgrade.targetPlan.monthlyPriceInCents,
          currencySnapshot: upgrade.targetPlan.currency,
        },
      });

      await logBillingAccessChange(tx, {
        subscriptionId: upgrade.subscriptionId,
        userId: upgrade.subscription.userId,
        action: "SUBSCRIPTION_PLAN_CHANGED",
        previousStatus: upgrade.fromPlanId,
        newStatus: upgrade.targetPlanId,
        reason: `PLAN_UPGRADE:${event}`,
        source: "ASAAS_BILLING_WEBHOOK",
        sourceReferenceId: upgrade.asaasPaymentId ?? upgrade.id,
      });
    }

    return {
      alreadyDone: false as const,
      cancelled: false as const,
      upgrade,
    };
  });

  if (!prep || prep.alreadyDone || prep.cancelled) return;

  const { upgrade } = prep;
  const externalSubId = upgrade.subscription.externalSubscriptionId;
  const synced = externalSubId
    ? await asaasClient.updateSubscriptionValue(
        externalSubId,
        upgrade.targetPlan.monthlyPriceInCents,
        `Assinatura ${upgrade.targetPlan.name}`,
        {
          userId: upgrade.subscription.userId,
          subscriptionId: upgrade.subscriptionId,
        },
      )
    : false;

  await prisma.subscriptionUpgrade.update({
    where: { id: upgrade.id },
    data: synced
      ? {
          status: "APPLIED",
          appliedAt: new Date(),
          errorMessage: null,
        }
      : {
          status: "PAID_PENDING_PROVIDER_SYNC",
          errorMessage:
            "Pagamento confirmado e plano liberado, mas falhou a sincronização do valor recorrente no Asaas.",
        },
  });
}

export class UpgradeCoachSubscription {
  constructor(private readonly asaasClient = new AsaasClient()) {}

  async initiate(input: { userId: string; planCode: string }) {
    const now = new Date();
    const subscription = await prisma.subscription.findUnique({
      where: { userId: input.userId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new BillingError(
        "SUBSCRIPTION_NOT_FOUND",
        404,
        "Assinatura não encontrada.",
      );
    }
    if (
      subscription.status !== "ACTIVE" ||
      subscription.billingProvider !== "ASAAS"
    ) {
      throw new BillingError(
        "UPGRADE_REQUIRES_ACTIVE_ASAAS",
        400,
        "Upgrade imediato é permitido apenas para assinaturas Asaas ativas.",
      );
    }
    if (
      !subscription.externalCustomerId ||
      !subscription.externalSubscriptionId
    ) {
      throw new BillingError(
        "MISSING_ASAAS_LINK",
        400,
        "A assinatura ainda não possui vínculo completo com o provedor de pagamentos.",
      );
    }

    const targetPlan = await prisma.plan.findUnique({
      where: { code: input.planCode },
    });
    if (
      !targetPlan ||
      !targetPlan.isActive ||
      !targetPlan.isPublic ||
      targetPlan.audience !== "COACH"
    ) {
      throw new BillingError(
        "TARGET_PLAN_NOT_FOUND",
        404,
        "Plano destino ativo não encontrado.",
      );
    }
    if (targetPlan.code === subscription.plan.code) {
      throw new BillingError(
        "SAME_PLAN",
        400,
        "Você já está utilizando este plano.",
      );
    }
    if (targetPlan.monthlyPriceInCents <= subscription.plan.monthlyPriceInCents) {
      throw new BillingError(
        "NOT_AN_UPGRADE",
        400,
        "O plano escolhido não é superior ao plano atual. Para planos menores, utilize o agendamento de downgrade.",
      );
    }

    const activeExisting = await prisma.subscriptionUpgrade.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: { in: ["PENDING_PAYMENT", "PAID_PENDING_PROVIDER_SYNC"] },
      },
      include: { fromPlan: true, targetPlan: true },
      orderBy: { createdAt: "desc" },
    });

    if (activeExisting) {
      return this.resumeExistingUpgrade(activeExisting, targetPlan.code);
    }

    const upgradeId = randomUUID();
    const externalReference = `trainvy:upgrade:v1:${upgradeId}`;

    const reservation = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${subscription.id} FOR UPDATE`;
      const locked = await tx.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
        include: { plan: true },
      });

      if (
        locked.status !== "ACTIVE" ||
        locked.billingProvider !== "ASAAS" ||
        !locked.externalCustomerId ||
        !locked.externalSubscriptionId
      ) {
        throw new BillingError(
          "UPGRADE_REQUIRES_ACTIVE_ASAAS",
          400,
          "Upgrade é permitido apenas para assinaturas Asaas ativas.",
        );
      }

      const concurrent = await tx.subscriptionUpgrade.findFirst({
        where: {
          subscriptionId: locked.id,
          status: { in: ["PENDING_PAYMENT", "PAID_PENDING_PROVIDER_SYNC"] },
        },
        include: { fromPlan: true, targetPlan: true },
        orderBy: { createdAt: "desc" },
      });
      if (concurrent) {
        return { created: false as const, upgrade: concurrent };
      }

      if (await hasPendingBillingTransition(tx, locked.id)) {
        throw new BillingError(
          "PENDING_BILLING_TRANSITION",
          409,
          "Existe uma transição de plano ou sincronização financeira pendente com o provedor de pagamentos.",
        );
      }

      const differenceInCents =
        targetPlan.monthlyPriceInCents - locked.plan.monthlyPriceInCents;
      if (differenceInCents <= 0) {
        throw new BillingError(
          "NOT_AN_UPGRADE",
          400,
          "O plano escolhido não é superior ao plano atual.",
        );
      }

      const created = await tx.subscriptionUpgrade.create({
        data: {
          id: upgradeId,
          subscriptionId: locked.id,
          fromPlanId: locked.planId,
          targetPlanId: targetPlan.id,
          differenceInCents,
          externalReference,
          status: "PENDING_PAYMENT",
          expiresAt: addUtcDays(now, 3),
        },
        include: { fromPlan: true, targetPlan: true },
      });

      return { created: true as const, upgrade: created };
    });

    if (!reservation.created) {
      return this.resumeExistingUpgrade(reservation.upgrade, targetPlan.code);
    }

    try {
      const paymentResult = await this.asaasClient.createOneTimePayment({
        customerId: subscription.externalCustomerId,
        amountInCents: reservation.upgrade.differenceInCents,
        description: `Upgrade de plano para ${targetPlan.name}`,
        externalReference,
        dueDateLimitDays: 3,
        userId: subscription.userId,
        subscriptionId: subscription.id,
      });

      const attached = await prisma.subscriptionUpgrade.update({
        where: { id: upgradeId },
        data: {
          asaasPaymentId: paymentResult.paymentId,
          invoiceUrl: paymentResult.invoiceUrl,
          errorMessage: null,
        },
        include: { fromPlan: true, targetPlan: true },
      });

      return this.toResponse(
        attached,
        "Cobrança de upgrade gerada com sucesso.",
      );
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : "Erro ao gerar cobrança";
      await prisma.subscriptionUpgrade.update({
        where: { id: upgradeId },
        data: { errorMessage: errMsg.slice(0, 1000) },
      });
      return this.toResponse(
        reservation.upgrade,
        "Solicitação de upgrade registrada. A cobrança está sendo conciliada com o Asaas.",
      );
    }
  }

  private async resumeExistingUpgrade(
    existing: {
      id: string;
      subscriptionId: string;
      asaasPaymentId: string | null;
      invoiceUrl: string | null;
      differenceInCents: number;
      externalReference: string;
      status: string;
      fromPlan: { code: string };
      targetPlan: { code: string; name: string };
    },
    requestedPlanCode: string,
  ) {
    if (existing.targetPlan.code !== requestedPlanCode) {
      throw new BillingError(
        "UPGRADE_ALREADY_PENDING",
        409,
        "Já existe um processo de upgrade pendente. Conclua ou cancele o upgrade atual antes de iniciar outro.",
      );
    }

    if (existing.status === "PAID_PENDING_PROVIDER_SYNC") {
      return this.toResponse(
        existing,
        "O pagamento foi confirmado e a sincronização da recorrência está em andamento.",
      );
    }

    if (existing.asaasPaymentId && existing.invoiceUrl) {
      return this.toResponse(
        existing,
        "Retornada cobrança de upgrade já existente.",
      );
    }

    const payments = await this.asaasClient.listPaymentsByExternalReference(
      existing.externalReference,
      { subscriptionId: existing.subscriptionId },
    );
    const recoverable = payments.find(
      (p) =>
        p.id &&
        (!p.status || !CANCELLED_PAYMENT_STATUSES.has(p.status.toUpperCase())),
    );
    if (recoverable) {
      const updated = await prisma.subscriptionUpgrade.update({
        where: { id: existing.id },
        data: {
          asaasPaymentId: recoverable.id,
          invoiceUrl: recoverable.invoiceUrl ?? existing.invoiceUrl,
          errorMessage: null,
        },
        include: { fromPlan: true, targetPlan: true },
      });
      return this.toResponse(
        updated,
        "Cobrança de upgrade recuperada com sucesso.",
      );
    }

    return this.toResponse(
      existing,
      "A cobrança do upgrade ainda está sendo processada. Tente novamente em instantes.",
    );
  }

  async getPending(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!subscription) return null;

    const u = await prisma.subscriptionUpgrade.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: { in: ["PENDING_PAYMENT", "PAID_PENDING_PROVIDER_SYNC"] },
      },
      include: { fromPlan: true, targetPlan: true },
      orderBy: { createdAt: "desc" },
    });
    if (!u) return null;

    return {
      upgradeId: u.id,
      asaasPaymentId: u.asaasPaymentId,
      invoiceUrl: u.invoiceUrl,
      differenceInCents: u.differenceInCents,
      fromPlanCode: u.fromPlan.code,
      fromPlanName: u.fromPlan.name,
      targetPlanCode: u.targetPlan.code,
      targetPlanName: u.targetPlan.name,
      status: u.status,
      createdAt: u.createdAt.toISOString(),
      expiresAt: u.expiresAt.toISOString(),
    };
  }

  async cancel(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    if (!subscription) {
      throw new BillingError(
        "SUBSCRIPTION_NOT_FOUND",
        404,
        "Assinatura não encontrada.",
      );
    }

    const pending = await prisma.subscriptionUpgrade.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: "PENDING_PAYMENT",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!pending) {
      throw new BillingError(
        "PENDING_UPGRADE_NOT_FOUND",
        404,
        "Nenhum upgrade pendente encontrado para cancelamento.",
      );
    }

    let paymentId = pending.asaasPaymentId;
    if (!paymentId) {
      const recovered = (
        await this.asaasClient.listPaymentsByExternalReference(
          pending.externalReference,
          { userId, subscriptionId: subscription.id },
        )
      ).find(
        (p) =>
          p.id &&
          (!p.status || !CANCELLED_PAYMENT_STATUSES.has(p.status.toUpperCase())),
      );
      if (recovered?.id) {
        paymentId = recovered.id;
        await prisma.subscriptionUpgrade.update({
          where: { id: pending.id },
          data: {
            asaasPaymentId: recovered.id,
            invoiceUrl: recovered.invoiceUrl ?? pending.invoiceUrl,
          },
        });
      }
    }

    if (paymentId) {
      const cancelled = await this.asaasClient.cancelOneTimePayment(
        paymentId,
        { userId, subscriptionId: subscription.id },
      );
      if (!cancelled) {
        const payment = await this.asaasClient.getPayment(paymentId, {
          userId,
          subscriptionId: subscription.id,
        });
        const statusUpper = payment?.status?.toUpperCase() ?? "";
        if (payment && PAID_PAYMENT_STATUSES.has(statusUpper)) {
          throw new BillingError(
            "UPGRADE_ALREADY_PAID",
            409,
            "O pagamento do upgrade já foi confirmado e não pode mais ser cancelado.",
          );
        }
        if (!payment || !CANCELLED_PAYMENT_STATUSES.has(statusUpper)) {
          throw new BillingError(
            "ASAAS_CANCELLATION_FAILED",
            409,
            "Não foi possível confirmar o cancelamento da cobrança no Asaas.",
          );
        }
      }
    }

    await prisma.subscriptionUpgrade.update({
      where: { id: pending.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    return { success: true as const };
  }

  private toResponse(
    upgrade: {
      id: string;
      asaasPaymentId: string | null;
      invoiceUrl: string | null;
      differenceInCents: number;
      status: string;
      fromPlan: { code: string };
      targetPlan: { code: string; name: string };
    },
    message: string,
  ) {
    return {
      upgradeId: upgrade.id,
      asaasPaymentId: upgrade.asaasPaymentId,
      invoiceUrl: upgrade.invoiceUrl,
      differenceInCents: upgrade.differenceInCents,
      fromPlanCode: upgrade.fromPlan.code,
      targetPlanCode: upgrade.targetPlan.code,
      targetPlanName: upgrade.targetPlan.name,
      status: upgrade.status,
      message,
    };
  }
}
