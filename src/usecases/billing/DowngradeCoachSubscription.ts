import { randomUUID } from "node:crypto";

import {
  BillingError,
  formatDateBr,
  hasPendingBillingTransition,
  isPaymentFutureAndEditable,
  logBillingAccessChange,
  resolveEffectiveBillingCycleEnd,
  resolvePlanPriceInCents,
} from "../../domain/billing.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { BillingCycle } from "../../generated/prisma/enums.js";
import { prisma } from "../../lib/db.js";
import { AsaasClient, reaisToCents } from "../../services/AsaasClient.js";

export interface PreparedFuturePayment {
  paymentId: string;
  originalAmountInCents: number;
  preparedAmountInCents: number;
}

export class DowngradeCoachSubscription {
  constructor(private readonly asaasClient = new AsaasClient()) {}

  async preview(input: {
    userId: string;
    planCode: string;
    billingCycle?: BillingCycle;
  }) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: input.userId },
      include: { plan: { include: { entitlements: true } } },
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
        "DOWNGRADE_REQUIRES_ACTIVE_ASAAS",
        400,
        "Alteração programada é permitida apenas para assinaturas ativas.",
      );
    }

    const targetCycle: BillingCycle =
      input.billingCycle ?? subscription.billingCycle;

    const targetPlan = await prisma.plan.findUnique({
      where: { code: input.planCode },
      include: { entitlements: true },
    });
    const targetPrice = targetPlan
      ? resolvePlanPriceInCents(targetPlan, targetCycle)
      : null;
    if (
      !targetPlan ||
      !targetPlan.isActive ||
      !targetPlan.isPublic ||
      targetPlan.audience !== subscription.plan.audience ||
      targetPrice === null ||
      targetPrice <= 0
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
    if (targetPrice >= currentPrice) {
      throw new BillingError(
        "NOT_A_DOWNGRADE",
        400,
        "O plano ou ciclo escolhido não é inferior ao atual. Para opções superiores, utilize a troca imediata.",
      );
    }

    const effectiveAt = await resolveEffectiveBillingCycleEnd(
      subscription,
      this.asaasClient,
    );
    const hasPendingTransition = await hasPendingBillingTransition(
      prisma,
      subscription.id,
    );

    const isCoachAudience = targetPlan.audience === "COACH";
    const activeLinks = isCoachAudience
      ? await prisma.coachAthlete.findMany({
          where: { coachId: input.userId, status: "ACTIVE" },
          include: {
            athlete: {
              select: {
                id: true,
                name: true,
                email: true,
                isManagedProfile: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

    const manageEnt = isCoachAudience
      ? targetPlan.entitlements.find(
          (e) => e.entitlement === "MANAGE_ATHLETES",
        )
      : undefined;
    const targetAthleteLimit = manageEnt?.limitValue ?? null;
    const excessAthletesCount =
      targetAthleteLimit !== null && activeLinks.length > targetAthleteLimit
        ? activeLinks.length - targetAthleteLimit
        : 0;

    return {
      effectiveAt: effectiveAt.toISOString(),
      fromPlan: {
        code: subscription.plan.code,
        name: subscription.plan.name,
        monthlyPriceInCents: subscription.plan.monthlyPriceInCents,
        annualPriceInCents: subscription.plan.annualPriceInCents,
      },
      targetPlan: {
        code: targetPlan.code,
        name: targetPlan.name,
        monthlyPriceInCents: targetPlan.monthlyPriceInCents,
        annualPriceInCents: targetPlan.annualPriceInCents,
      },
      targetAthleteLimit,
      activeAthletesCount: activeLinks.length,
      excessAthletesCount,
      athletes: activeLinks.map((link) => ({
        linkId: link.id,
        athleteId: link.athlete.id,
        name: link.athlete.name,
        email: link.athlete.isManagedProfile ? null : link.athlete.email,
        isManagedProfile: link.athlete.isManagedProfile,
        createdAt: link.createdAt.toISOString(),
      })),
      hasPendingTransition,
      pendingTransitionMessage: hasPendingTransition
        ? "Existe uma transição de plano ou sincronização financeira pendente."
        : null,
    };
  }

  async schedule(input: {
    userId: string;
    planCode: string;
    billingCycle?: BillingCycle;
    retainedAthleteIds?: string[];
    acknowledgeExcessAthletes?: boolean;
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
        "DOWNGRADE_REQUIRES_ACTIVE_ASAAS",
        400,
        "Alteração programada é permitida apenas para assinaturas ativas.",
      );
    }
    if (
      !subscription.externalCustomerId ||
      !subscription.externalSubscriptionId
    ) {
      throw new BillingError(
        "MISSING_ASAAS_LINK",
        400,
        "A assinatura não possui vínculo completo com o provedor de pagamentos.",
      );
    }

    if (await hasPendingBillingTransition(prisma, subscription.id)) {
      throw new BillingError(
        "PENDING_BILLING_TRANSITION",
        409,
        "Existe uma transição de plano ou sincronização financeira pendente.",
      );
    }

    const targetCycle: BillingCycle =
      input.billingCycle ?? subscription.billingCycle;

    const targetPlan = await prisma.plan.findUnique({
      where: { code: input.planCode },
      include: { entitlements: true },
    });
    const targetPrice = targetPlan
      ? resolvePlanPriceInCents(targetPlan, targetCycle)
      : null;
    if (
      !targetPlan ||
      !targetPlan.isActive ||
      !targetPlan.isPublic ||
      targetPlan.audience !== subscription.plan.audience ||
      targetPrice === null ||
      targetPrice <= 0
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
        "Você já está neste plano e ciclo.",
      );
    }
    const currentPrice =
      resolvePlanPriceInCents(subscription.plan, subscription.billingCycle) ??
      subscription.priceInCentsSnapshot;
    if (targetPrice >= currentPrice) {
      throw new BillingError(
        "NOT_A_DOWNGRADE",
        400,
        "O plano ou ciclo escolhido não é inferior ao atual.",
      );
    }

    const effectiveAt = await resolveEffectiveBillingCycleEnd(
      subscription,
      this.asaasClient,
      now,
    );

    const isCoachAudience = targetPlan.audience === "COACH";
    const activeLinks = isCoachAudience
      ? await prisma.coachAthlete.findMany({
          where: { coachId: input.userId, status: "ACTIVE" },
          select: { athleteId: true },
        })
      : [];
    const validAthleteIds = new Set(activeLinks.map((l) => l.athleteId));

    const retainedAthleteIds = isCoachAudience
      ? Array.from(new Set(input.retainedAthleteIds ?? []))
      : [];
    for (const athleteId of retainedAthleteIds) {
      if (!validAthleteIds.has(athleteId)) {
        throw new BillingError(
          "INVALID_RETAINED_ATHLETE",
          400,
          "Aluno selecionado não possui vínculo ativo com sua conta.",
        );
      }
    }

    const targetAthleteLimit = isCoachAudience
      ? (targetPlan.entitlements.find(
          (e) => e.entitlement === "MANAGE_ATHLETES",
        )?.limitValue ?? null)
      : null;

    if (
      targetAthleteLimit !== null &&
      retainedAthleteIds.length > targetAthleteLimit
    ) {
      throw new BillingError(
        "ATHLETE_LIMIT_EXCEEDED",
        400,
        `Quantidade de alunos selecionados (${retainedAthleteIds.length}) excede o limite do plano (${targetAthleteLimit}).`,
      );
    }

    if (
      targetAthleteLimit !== null &&
      activeLinks.length > targetAthleteLimit &&
      !input.acknowledgeExcessAthletes
    ) {
      throw new BillingError(
        "ACKNOWLEDGEMENT_REQUIRED",
        400,
        "É necessário confirmar ciência sobre o encerramento dos vínculos de alunos excedentes na virada do ciclo.",
      );
    }

    // Fase 1 Saga: snapshot prévio de cobranças futuras
    const initialPreparedPayments: PreparedFuturePayment[] = [];
    const asaasPayments = await this.asaasClient.listPaymentsBySubscription(
      subscription.externalSubscriptionId,
      { userId: input.userId, subscriptionId: subscription.id },
    );
    for (const p of asaasPayments) {
      if (isPaymentFutureAndEditable(p, effectiveAt)) {
        initialPreparedPayments.push({
          paymentId: p.id,
          originalAmountInCents: reaisToCents(p.value) ?? currentPrice,
          preparedAmountInCents: targetPrice,
        });
      }
    }

    const downgradeId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${subscription.id} FOR UPDATE`;
      if (await hasPendingBillingTransition(tx, subscription.id)) {
        throw new BillingError(
          "PENDING_BILLING_TRANSITION",
          409,
          "Existe uma transição de plano ou sincronização financeira pendente.",
        );
      }

      await tx.subscriptionDowngrade.create({
        data: {
          id: downgradeId,
          subscriptionId: subscription.id,
          fromPlanId: subscription.planId,
          targetPlanId: targetPlan.id,
          fromBillingCycle: subscription.billingCycle,
          targetBillingCycle: targetCycle,
          effectiveAt,
          status: "SCHEDULED",
          acknowledgedAt: now,
          retainedAthleteIds: retainedAthleteIds as unknown as Prisma.InputJsonValue,
          preparedFuturePayments:
            initialPreparedPayments as unknown as Prisma.InputJsonValue,
          asaasSyncStatus: "PENDING_RETRY",
        },
      });
    });

    await this.executeAsaasSync(downgradeId);

    return {
      downgradeId,
      targetPlanCode: targetPlan.code,
      targetPlanName: targetPlan.name,
      fromBillingCycle: subscription.billingCycle,
      targetBillingCycle: targetCycle,
      effectiveAt: effectiveAt.toISOString(),
      status: "SCHEDULED",
      message: `Alteração agendada com sucesso para ${formatDateBr(effectiveAt)}.`,
    };
  }

  async executeAsaasSync(downgradeId: string) {
    const downgrade = await prisma.subscriptionDowngrade.findUnique({
      where: { id: downgradeId },
      include: {
        subscription: true,
        targetPlan: true,
      },
    });

    if (
      !downgrade ||
      !["SCHEDULED", "APPLIED"].includes(downgrade.status)
    ) {
      return;
    }

    const externalSubId = downgrade.subscription.externalSubscriptionId;
    if (!externalSubId) {
      await prisma.subscriptionDowngrade.update({
        where: { id: downgradeId },
        data: {
          asaasSyncStatus: "FAILED",
          errorMessage: "ID de assinatura do provedor ausente.",
        },
      });
      return;
    }

    const ctx = {
      userId: downgrade.subscription.userId,
      subscriptionId: downgrade.subscriptionId,
    };

    const targetCyclePrice =
      resolvePlanPriceInCents(
        downgrade.targetPlan,
        downgrade.targetBillingCycle,
      ) ?? downgrade.targetPlan.monthlyPriceInCents;

    const subUpdated = await this.asaasClient.updateSubscriptionValue(
      externalSubId,
      targetCyclePrice,
      downgrade.targetBillingCycle === "YEARLY"
        ? `Assinatura alterada para ${downgrade.targetPlan.name} (Anual)`
        : `Assinatura alterada para ${downgrade.targetPlan.name}`,
      ctx,
      downgrade.targetBillingCycle,
    );

    if (!subUpdated) {
      await prisma.subscriptionDowngrade.update({
        where: { id: downgradeId },
        data: {
          asaasSyncStatus: "PENDING_RETRY",
          errorMessage: "Falha ao atualizar valor da assinatura no provedor.",
        },
      });
      return;
    }

    const payments = await this.asaasClient.listPaymentsBySubscription(
      externalSubId,
      ctx,
    );
    const snapshotMap = new Map<string, PreparedFuturePayment>();
    const existingPrepared = Array.isArray(downgrade.preparedFuturePayments)
      ? (downgrade.preparedFuturePayments as unknown as PreparedFuturePayment[])
      : [];
    for (const item of existingPrepared) {
      snapshotMap.set(item.paymentId, item);
    }

    let snapshotModified = false;
    for (const p of payments) {
      if (
        isPaymentFutureAndEditable(p, downgrade.effectiveAt) &&
        !snapshotMap.has(p.id)
      ) {
        snapshotMap.set(p.id, {
          paymentId: p.id,
          originalAmountInCents: reaisToCents(p.value) ?? targetCyclePrice,
          preparedAmountInCents: targetCyclePrice,
        });
        snapshotModified = true;
      }
    }

    if (snapshotModified) {
      await prisma.subscriptionDowngrade.update({
        where: { id: downgradeId },
        data: {
          preparedFuturePayments: Array.from(
            snapshotMap.values(),
          ) as unknown as Prisma.InputJsonValue,
        },
      });
    }

    let allPaymentsOk = true;
    for (const prep of snapshotMap.values()) {
      const ok = await this.asaasClient.updatePaymentValue(
        prep.paymentId,
        prep.preparedAmountInCents,
        ctx,
      );
      if (!ok) allPaymentsOk = false;
    }

    await prisma.subscriptionDowngrade.update({
      where: { id: downgradeId },
      data: allPaymentsOk
        ? { asaasSyncStatus: "SYNCED", errorMessage: null }
        : {
            asaasSyncStatus: "PENDING_RETRY",
            errorMessage:
              "Uma ou mais cobranças futuras falharam ao atualizar valor.",
          },
    });
  }

  async executeAsaasReversal(downgradeId: string) {
    const downgrade = await prisma.subscriptionDowngrade.findUnique({
      where: { id: downgradeId },
      include: {
        subscription: true,
        fromPlan: true,
      },
    });
    if (!downgrade) return;

    const externalSubId = downgrade.subscription.externalSubscriptionId;
    if (!externalSubId) {
      await prisma.subscriptionDowngrade.update({
        where: { id: downgradeId },
        data: { asaasReversalStatus: "FAILED" },
      });
      return;
    }

    const ctx = {
      userId: downgrade.subscription.userId,
      subscriptionId: downgrade.subscriptionId,
    };

    const fromCyclePrice =
      resolvePlanPriceInCents(
        downgrade.fromPlan,
        downgrade.fromBillingCycle,
      ) ?? downgrade.fromPlan.monthlyPriceInCents;

    const subRestored = await this.asaasClient.updateSubscriptionValue(
      externalSubId,
      fromCyclePrice,
      `Assinatura restaurada para ${downgrade.fromPlan.name}`,
      ctx,
      downgrade.fromBillingCycle,
    );

    const payments = await this.asaasClient.listPaymentsBySubscription(
      externalSubId,
      ctx,
    );
    const snapshotMap = new Map<string, PreparedFuturePayment>();
    const existingPrepared = Array.isArray(downgrade.preparedFuturePayments)
      ? (downgrade.preparedFuturePayments as unknown as PreparedFuturePayment[])
      : [];
    for (const item of existingPrepared) {
      snapshotMap.set(item.paymentId, item);
    }

    let allReverted = subRestored;
    for (const p of payments) {
      if (isPaymentFutureAndEditable(p, downgrade.effectiveAt)) {
        const targetCents =
          snapshotMap.get(p.id)?.originalAmountInCents ?? fromCyclePrice;
        const currentCents = reaisToCents(p.value);
        if (currentCents === null || currentCents !== targetCents) {
          const ok = await this.asaasClient.updatePaymentValue(
            p.id,
            targetCents,
            ctx,
          );
          if (!ok) allReverted = false;
        }
      }
    }

    await prisma.subscriptionDowngrade.update({
      where: { id: downgradeId },
      data: {
        asaasReversalStatus: allReverted ? "REVERSED" : "PENDING_RETRY",
      },
    });
  }

  async cancel(userId: string) {
    const now = new Date();
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

    const downgrade = await prisma.subscriptionDowngrade.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: "SCHEDULED",
      },
      orderBy: { createdAt: "desc" },
    });
    if (!downgrade) {
      throw new BillingError(
        "PENDING_DOWNGRADE_NOT_FOUND",
        404,
        "Nenhum downgrade agendado encontrado para cancelamento.",
      );
    }
    if (now >= downgrade.effectiveAt) {
      throw new BillingError(
        "DOWNGRADE_ALREADY_EFFECTIVE",
        409,
        "O período para cancelamento expirou pois o downgrade já entrou em vigor.",
      );
    }

    await this.executeAsaasReversal(downgrade.id);

    await prisma.subscriptionDowngrade.update({
      where: { id: downgrade.id },
      data: { status: "CANCELLED", cancelledAt: now },
    });

    return { success: true as const };
  }

  async applyScheduledDowngrade(downgradeId: string) {
    const now = new Date();
    const shouldSync = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "subscription_downgrades" WHERE id = ${downgradeId} FOR UPDATE`;
      const dg = await tx.subscriptionDowngrade.findUnique({
        where: { id: downgradeId },
        include: {
          subscription: true,
          targetPlan: { include: { entitlements: true } },
        },
      });
      if (!dg || dg.status !== "SCHEDULED" || now < dg.effectiveAt) {
        return { applySync: false };
      }

      const resolvedTargetPrice =
        resolvePlanPriceInCents(dg.targetPlan, dg.targetBillingCycle) ??
        dg.targetPlan.monthlyPriceInCents;

      await tx.subscription.update({
        where: { id: dg.subscriptionId },
        data: {
          planId: dg.targetPlanId,
          billingCycle: dg.targetBillingCycle,
          priceInCentsSnapshot: resolvedTargetPrice,
          currencySnapshot: dg.targetPlan.currency,
        },
      });

      const limit =
        dg.targetPlan.audience === "COACH"
          ? (dg.targetPlan.entitlements.find(
              (e) => e.entitlement === "MANAGE_ATHLETES",
            )?.limitValue ?? null)
          : null;

      if (limit !== null) {
        const retained = new Set(
          Array.isArray(dg.retainedAthleteIds)
            ? (dg.retainedAthleteIds as string[])
            : [],
        );
        const activeLinks = await tx.coachAthlete.findMany({
          where: { coachId: dg.subscription.userId, status: "ACTIVE" },
          orderBy: { createdAt: "asc" },
        });

        if (activeLinks.length > limit) {
          const toRevokeIds: string[] = [];
          let keptCount = 0;
          for (const link of activeLinks) {
            if (retained.has(link.athleteId) && keptCount < limit) {
              keptCount++;
            } else if (retained.size === 0 && keptCount < limit) {
              keptCount++;
            } else {
              toRevokeIds.push(link.id);
            }
          }
          if (toRevokeIds.length > 0) {
            await tx.coachAthlete.updateMany({
              where: { id: { in: toRevokeIds } },
              data: {
                status: "REVOKED",
                revokedAt: now,
                revokedByUserId: dg.subscription.userId,
                evolutionShared: false,
                evolutionRevokedAt: now,
              },
            });
          }
        }
      }

      await logBillingAccessChange(tx, {
        subscriptionId: dg.subscriptionId,
        userId: dg.subscription.userId,
        action: "SUBSCRIPTION_PLAN_CHANGED",
        previousStatus: dg.fromPlanId,
        newStatus: dg.targetPlanId,
        reason: "SCHEDULED_DOWNGRADE_APPLIED",
        source: "BILLING_RECONCILIATION",
        sourceReferenceId: dg.id,
      });

      await tx.subscriptionDowngrade.update({
        where: { id: dg.id },
        data: { status: "APPLIED", appliedAt: now },
      });

      return { applySync: dg.asaasSyncStatus !== "SYNCED" };
    });

    if (shouldSync.applySync) {
      await this.executeAsaasSync(downgradeId);
    }
  }

  async getPending(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!subscription) return null;

    const dg = await prisma.subscriptionDowngrade.findFirst({
      where: { subscriptionId: subscription.id, status: "SCHEDULED" },
      include: { fromPlan: true, targetPlan: true },
      orderBy: { createdAt: "desc" },
    });
    if (!dg) return null;

    return {
      downgradeId: dg.id,
      fromPlanCode: dg.fromPlan.code,
      fromPlanName: dg.fromPlan.name,
      targetPlanCode: dg.targetPlan.code,
      targetPlanName: dg.targetPlan.name,
      fromBillingCycle: dg.fromBillingCycle,
      targetBillingCycle: dg.targetBillingCycle,
      effectiveAt: dg.effectiveAt.toISOString(),
      status: dg.status,
      asaasSyncStatus: dg.asaasSyncStatus,
      retainedAthleteIds: Array.isArray(dg.retainedAthleteIds)
        ? (dg.retainedAthleteIds as string[])
        : [],
      createdAt: dg.createdAt.toISOString(),
    };
  }
}
