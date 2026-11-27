import { randomUUID } from "node:crypto";

import {
  addUtcDays,
  addUtcMonths,
  BillingError,
  CANCELLED_PAYMENT_STATUSES,
  hasPendingBillingTransition,
  logBillingAccessChange,
  PAID_PAYMENT_STATUSES,
  resolvePlanPriceInCents,
} from "../../domain/billing.js";
import type { BillingCycle } from "../../generated/prisma/enums.js";
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

    const resolvedTargetPrice =
      resolvePlanPriceInCents(upgrade.targetPlan, upgrade.targetBillingCycle) ??
      upgrade.targetPlan.monthlyPriceInCents;

    if (
      ["PENDING_PAYMENT", "EXPIRED", "FAILED"].includes(upgrade.status)
    ) {
      await tx.subscriptionUpgrade.update({
        where: { id: upgrade.id },
        data: { paidAt: now },
      });

      const switchedToYearly =
        upgrade.fromBillingCycle === "MONTHLY" &&
        upgrade.targetBillingCycle === "YEARLY";
      const extendedPeriodEnd = switchedToYearly
        ? addUtcMonths(upgrade.subscription.currentPeriodStart ?? now, 12)
        : undefined;

      await tx.subscription.update({
        where: { id: upgrade.subscriptionId },
        data: {
          planId: upgrade.targetPlanId,
          billingCycle: upgrade.targetBillingCycle,
          priceInCentsSnapshot: resolvedTargetPrice,
          currencySnapshot: upgrade.targetPlan.currency,
          ...(extendedPeriodEnd
            ? {
                currentPeriodEnd: extendedPeriodEnd,
                paidUntil: extendedPeriodEnd,
                graceUntil: addUtcDays(extendedPeriodEnd, 3),
                nextDueDate: extendedPeriodEnd,
              }
            : {}),
        },
      });

      await logBillingAccessChange(tx, {
        subscriptionId: upgrade.subscriptionId,
        userId: upgrade.subscription.userId,
        action: "SUBSCRIPTION_PLAN_CHANGED",
        previousStatus: `${upgrade.fromPlanId}:${upgrade.fromBillingCycle}`,
        newStatus: `${upgrade.targetPlanId}:${upgrade.targetBillingCycle}`,
        reason: `PLAN_UPGRADE:${event}`,
        source: "ASAAS_BILLING_WEBHOOK",
        sourceReferenceId: upgrade.asaasPaymentId ?? upgrade.id,
      });
    }

    return {
      alreadyDone: false as const,
      cancelled: false as const,
      upgrade,
      resolvedTargetPrice,
    };
  });

  if (!prep || prep.alreadyDone || prep.cancelled) return;

  const { upgrade, resolvedTargetPrice } = prep;
  const externalSubId = upgrade.subscription.externalSubscriptionId;
  const synced = externalSubId
    ? await asaasClient.updateSubscriptionValue(
        externalSubId,
        resolvedTargetPrice,
        upgrade.targetBillingCycle === "YEARLY"
          ? `Assinatura ${upgrade.targetPlan.name} (Anual)`
          : `Assinatura ${upgrade.targetPlan.name}`,
        {
          userId: upgrade.subscription.userId,
          subscriptionId: upgrade.subscriptionId,
        },
        upgrade.targetBillingCycle,
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
            "Pagamento confirmado e plano liberado, mas falhou a sincronização do valor recorrente.",
        },
  });
}

export class UpgradeCoachSubscription {
  constructor(private readonly asaasClient = new AsaasClient()) {}

  async initiate(input: {
    userId: string;
    planCode: string;
    billingCycle?: BillingCycle;
  }) {
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
        "Upgrade imediato é permitido apenas para assinaturas ativas.",
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

    const targetCycle: BillingCycle =
      input.billingCycle ?? subscription.billingCycle;

    const targetPlan = await prisma.plan.findUnique({
      where: { code: input.planCode },
    });
    if (
      !targetPlan ||
      !targetPlan.isActive ||
      !targetPlan.isPublic ||
      targetPlan.audience !== subscription.plan.audience
    ) {
      throw new BillingError(
        "TARGET_PLAN_NOT_FOUND",
        404,
        "Plano destino ativo não encontrado.",
      );
    }
    if (
      targetPlan.code === subscription.plan.code &&
      targetCycle === subscription.billingCycle
    ) {
      throw new BillingError(
        "SAME_PLAN",
        400,
        "Você já está utilizando este plano e ciclo.",
      );
    }

    const currentPrice =
      resolvePlanPriceInCents(subscription.plan, subscription.billingCycle) ??
      subscription.priceInCentsSnapshot;
    const targetPrice = resolvePlanPriceInCents(targetPlan, targetCycle);
    if (targetPrice === null || targetPrice <= 0) {
      throw new BillingError(
        "TARGET_PLAN_NOT_FOUND",
        404,
        "Ciclo de cobrança indisponível para o plano selecionado.",
      );
    }
    if (targetPrice <= currentPrice) {
      throw new BillingError(
        "NOT_AN_UPGRADE",
        400,
        "O plano ou ciclo escolhido não possui valor superior ao atual. Para opções menores, utilize o agendamento de alteração.",
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
      return this.resumeExistingUpgrade(
        activeExisting,
        targetPlan.code,
        targetCycle,
      );
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
          "Upgrade é permitido apenas para assinaturas ativas.",
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

      const lockedCurrentPrice =
        resolvePlanPriceInCents(locked.plan, locked.billingCycle) ??
        locked.priceInCentsSnapshot;
      const differenceInCents = targetPrice - lockedCurrentPrice;
      if (differenceInCents <= 0) {
        throw new BillingError(
          "NOT_AN_UPGRADE",
          400,
          "O plano ou ciclo escolhido não é superior ao atual.",
        );
      }

      const created = await tx.subscriptionUpgrade.create({
        data: {
          id: upgradeId,
          subscriptionId: locked.id,
          fromPlanId: locked.planId,
          targetPlanId: targetPlan.id,
          fromBillingCycle: locked.billingCycle,
          targetBillingCycle: targetCycle,
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
      return this.resumeExistingUpgrade(
        reservation.upgrade,
        targetPlan.code,
        targetCycle,
      );
    }

    try {
      const paymentResult = await this.asaasClient.createOneTimePayment({
        customerId: subscription.externalCustomerId,
        amountInCents: reservation.upgrade.differenceInCents,
        description:
          targetCycle === "YEARLY"
            ? `Upgrade de plano para ${targetPlan.name} (Anual)`
            : `Upgrade de plano para ${targetPlan.name}`,
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
        "Solicitação de upgrade registrada. A cobrança está sendo conciliada.",
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
      fromBillingCycle: BillingCycle;
      targetBillingCycle: BillingCycle;
      externalReference: string;
      status: string;
      fromPlan: { code: string };
      targetPlan: { code: string; name: string };
    },
    requestedPlanCode: string,
    requestedBillingCycle: BillingCycle,
  ) {
    if (
      existing.targetPlan.code !== requestedPlanCode ||
      existing.targetBillingCycle !== requestedBillingCycle
    ) {
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
      fromBillingCycle: u.fromBillingCycle,
      targetBillingCycle: u.targetBillingCycle,
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
            "Não foi possível confirmar o cancelamento da cobrança.",
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
      fromBillingCycle: BillingCycle;
      targetBillingCycle: BillingCycle;
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
      fromBillingCycle: upgrade.fromBillingCycle,
      targetBillingCycle: upgrade.targetBillingCycle,
      status: upgrade.status,
      message,
    };
  }
}
