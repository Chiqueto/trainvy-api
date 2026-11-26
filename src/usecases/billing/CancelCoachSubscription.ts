import {
  BillingError,
  isCoolingOffActive,
  logBillingAccessChange,
} from "../../domain/billing.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/db.js";
import { AsaasClient } from "../../services/AsaasClient.js";

export class CancelCoachSubscription {
  constructor(private readonly asaasClient = new AsaasClient()) {}

  async execute(input: { userId: string; reason?: string }) {
    const now = new Date();
    const subscription = await prisma.subscription.findUnique({
      where: { userId: input.userId },
      include: { refunds: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!subscription) {
      throw new BillingError(
        "SUBSCRIPTION_NOT_FOUND",
        404,
        "Assinatura não encontrada.",
      );
    }

    // Idempotência: se já cancelada (ou já teve reembolso solicitado)
    const latestRefund = subscription.refunds[0];
    if (
      subscription.status === "CANCELED" &&
      (!subscription.cancelAtPeriodEnd ||
        (latestRefund &&
          ["REQUESTED", "PROCESSING", "REFUNDED"].includes(latestRefund.status)))
    ) {
      return {
        subscriptionId: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        paidUntil: subscription.paidUntil?.toISOString() ?? null,
        refundRequested: Boolean(latestRefund),
        refundStatus: latestRefund?.status ?? null,
        message: "A assinatura já encontra-se cancelada ou reembolsada.",
      };
    }

    if (subscription.billingProvider === "MANUAL") {
      throw new BillingError(
        "MANUAL_SUBSCRIPTION_CANCEL_FORBIDDEN",
        409,
        "Assinaturas gerenciadas manualmente devem ser encerradas pelo suporte administrativo.",
      );
    }

    // Cancela recorrência no Asaas se existir vínculo externo
    if (subscription.externalSubscriptionId) {
      await this.asaasClient.cancelSubscription(
        subscription.externalSubscriptionId,
        { userId: subscription.userId, subscriptionId: subscription.id },
      );
    }

    // Cancela upgrades pendentes e downgrades agendados
    await prisma.subscriptionUpgrade.updateMany({
      where: {
        subscriptionId: subscription.id,
        status: "PENDING_PAYMENT",
      },
      data: { status: "CANCELLED", cancelledAt: now },
    });

    await prisma.subscriptionDowngrade.updateMany({
      where: {
        subscriptionId: subscription.id,
        status: "SCHEDULED",
      },
      data: { status: "CANCELLED", cancelledAt: now },
    });

    const coolingOff =
      subscription.billingProvider === "ASAAS" &&
      isCoolingOffActive(subscription, now);

    if (coolingOff) {
      const eligiblePayment = await prisma.subscriptionPayment.findFirst({
        where: {
          subscriptionId: subscription.id,
          status: { in: ["RECEIVED", "CONFIRMED"] },
          providerPaymentId: { not: null },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!eligiblePayment?.providerPaymentId) {
        const updated = await prisma.$transaction(async (tx) => {
          const prevStatus = subscription.status;
          const saved = await tx.subscription.update({
            where: { id: subscription.id },
            data: {
              status: "CANCELED",
              cancelAtPeriodEnd: false,
              canceledAt: now,
              blockedAt: now,
              currentPeriodEnd: now,
              paidUntil: now,
              graceUntil: null,
            },
          });
          await logBillingAccessChange(tx, {
            subscriptionId: saved.id,
            userId: saved.userId,
            action: "SUBSCRIPTION_STATUS_CHANGED",
            previousStatus: prevStatus,
            newStatus: "CANCELED",
            reason: "SUBSCRIPTION_CANCELED_WITHOUT_PAYMENT",
            source: "COACH_CANCEL_SUBSCRIPTION",
            sourceReferenceId: saved.id,
          });
          return saved;
        });

        return {
          subscriptionId: updated.id,
          status: updated.status,
          cancelAtPeriodEnd: false,
          paidUntil: updated.paidUntil?.toISOString() ?? null,
          refundRequested: false,
          refundStatus: null,
          message:
            "Assinatura cancelada sem reembolso pois não havia pagamento processado.",
        };
      }

      const refund = await prisma.subscriptionRefund.create({
        data: {
          subscriptionId: subscription.id,
          subscriptionPaymentId: eligiblePayment.id,
          provider: "ASAAS",
          providerPaymentId: eligiblePayment.providerPaymentId,
          refundType: "COOLING_OFF",
          status: "REQUESTED",
          reason: input.reason?.trim() || "Arrependimento dentro de 7 dias",
          amountInCents: eligiblePayment.amountInCents,
          currency: eligiblePayment.currency,
          requestedAt: now,
        },
      });

      const asaasResult = await this.asaasClient.refundPayment(
        eligiblePayment.providerPaymentId,
        { userId: subscription.userId, subscriptionId: subscription.id },
      );

      const nextRefundStatus = asaasResult.success
        ? asaasResult.status.toUpperCase() === "REFUNDED"
          ? "REFUNDED"
          : "PROCESSING"
        : "FAILED";

      const updatedRefund = await prisma.subscriptionRefund.update({
        where: { id: refund.id },
        data: {
          status: nextRefundStatus,
          providerRefundId: asaasResult.refundId,
          processedAt: nextRefundStatus === "REFUNDED" ? now : null,
          failedAt: nextRefundStatus === "FAILED" ? now : null,
          rawPayload: (asaasResult.rawPayload ??
            undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      const updatedSub = await prisma.$transaction(async (tx) => {
        const prevStatus = subscription.status;
        const saved = await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "CANCELED",
            cancelAtPeriodEnd: false,
            canceledAt: now,
            blockedAt: now,
            currentPeriodEnd: now,
            paidUntil: now,
            graceUntil: null,
          },
        });
        await logBillingAccessChange(tx, {
          subscriptionId: saved.id,
          userId: saved.userId,
          action: "REFUND_STATUS_CHANGED",
          previousStatus: prevStatus,
          newStatus: "CANCELED",
          reason: "COOLING_OFF_REFUND_REQUESTED",
          source: "COACH_CANCEL_SUBSCRIPTION",
          sourceReferenceId: updatedRefund.id,
        });
        return saved;
      });

      return {
        subscriptionId: updatedSub.id,
        status: updatedSub.status,
        cancelAtPeriodEnd: false,
        paidUntil: updatedSub.paidUntil?.toISOString() ?? null,
        refundRequested: true,
        refundStatus: updatedRefund.status,
        message:
          "Cancelamento por arrependimento solicitado. O reembolso será processado pelo Asaas.",
      };
    }

    // Cancelamento padrão (fora dos 7 dias): mantém acesso até o fim do período pago
    const hasRemainingPaidPeriod =
      subscription.paidUntil !== null && subscription.paidUntil > now;

    const updated = await prisma.$transaction(async (tx) => {
      const prevStatus = subscription.status;
      const saved = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "CANCELED",
          canceledAt: now,
          cancelAtPeriodEnd: hasRemainingPaidPeriod,
          blockedAt: hasRemainingPaidPeriod ? null : now,
          currentPeriodEnd: hasRemainingPaidPeriod
            ? subscription.paidUntil
            : now,
          trialEndsAt:
            prevStatus === "TRIALING" ? now : subscription.trialEndsAt,
        },
      });
      await logBillingAccessChange(tx, {
        subscriptionId: saved.id,
        userId: saved.userId,
        action: "SUBSCRIPTION_STATUS_CHANGED",
        previousStatus: prevStatus,
        newStatus: "CANCELED",
        reason: hasRemainingPaidPeriod
          ? "SUBSCRIPTION_CANCELED_AT_PERIOD_END"
          : "SUBSCRIPTION_CANCELED",
        source: "COACH_CANCEL_SUBSCRIPTION",
        sourceReferenceId: saved.id,
      });
      return saved;
    });

    return {
      subscriptionId: updated.id,
      status: updated.status,
      cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
      paidUntil: updated.paidUntil?.toISOString() ?? null,
      refundRequested: false,
      refundStatus: null,
      message: hasRemainingPaidPeriod
        ? "Assinatura cancelada. Seu acesso permanece ativo até o fim do período pago."
        : "Assinatura cancelada com sucesso.",
    };
  }
}
