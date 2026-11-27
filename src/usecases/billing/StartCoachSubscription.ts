import {
  BillingError,
  buildSubscriptionCheckoutExternalReference,
  logBillingAccessChange,
  resolvePlanPriceInCents,
  validCpfOrCnpj,
} from "../../domain/billing.js";
import { subscriptionGrantsAccess } from "../../domain/commercial.js";
import type { BillingCycle } from "../../generated/prisma/enums.js";
import { prisma } from "../../lib/db.js";
import { AsaasClient } from "../../services/AsaasClient.js";

export interface StartCoachSubscriptionInput {
  userId: string;
  planCode: string;
  cpfCnpj: string;
  billingCycle?: BillingCycle;
}

export class StartCoachSubscription {
  constructor(private readonly asaasClient = new AsaasClient()) {}

  async execute(input: StartCoachSubscriptionInput) {
    const now = new Date();
    const billingCycle: BillingCycle = input.billingCycle ?? "MONTHLY";
    const cleanedCpfCnpj = input.cpfCnpj.replace(/\D/g, "");
    if (!validCpfOrCnpj(cleanedCpfCnpj)) {
      throw new BillingError(
        "INVALID_CPF_CNPJ",
        400,
        "Informe um CPF ou CNPJ válido para iniciar a assinatura.",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      include: { subscription: true },
    });

    if (!user || user.deletedAt) {
      throw new BillingError("USER_NOT_FOUND", 404, "Usuário não encontrado.");
    }
    if (!user.accountSetupCompletedAt) {
      throw new BillingError(
        "ACCOUNT_SETUP_REQUIRED",
        409,
        "Conclua a configuração inicial da conta antes de assinar.",
      );
    }
    if (user.accountType !== "COACH" && user.accountType !== "ATHLETE") {
      throw new BillingError(
        "BILLING_NOT_AVAILABLE",
        403,
        "Apenas contas de treinador ou atleta podem contratar planos.",
      );
    }

    const plan = await prisma.plan.findUnique({
      where: { code: input.planCode },
      include: { entitlements: true },
    });
    const cyclePriceInCents = plan
      ? resolvePlanPriceInCents(plan, billingCycle)
      : null;
    if (
      !plan ||
      !plan.isActive ||
      !plan.isPublic ||
      plan.audience !== user.accountType ||
      cyclePriceInCents === null ||
      cyclePriceInCents <= 0
    ) {
      throw new BillingError(
        "INVALID_BILLING_PLAN",
        404,
        "Plano ativo ou ciclo de cobrança indisponível para assinatura.",
      );
    }

    // Valida limite de alunos do plano escolhido antes do checkout (equivalente ao PlanGatingService do Marca-Lá)
    if (user.accountType === "COACH") {
      const manageAthletesEntitlement = plan.entitlements.find(
        (e) => e.entitlement === "MANAGE_ATHLETES",
      );
      if (
        manageAthletesEntitlement &&
        manageAthletesEntitlement.limitValue !== null
      ) {
        const activeAthletesCount = await prisma.coachAthlete.count({
          where: { coachId: user.id, status: "ACTIVE" },
        });
        if (activeAthletesCount > manageAthletesEntitlement.limitValue) {
          throw new BillingError(
            "PLAN_ATHLETE_LIMIT_EXCEEDED",
            409,
            `Você possui ${activeAthletesCount} alunos ativos, mas o plano ${plan.name} permite até ${manageAthletesEntitlement.limitValue}. Desvincule alunos excedentes ou escolha um plano superior.`,
          );
        }
      }
    }

    const existingSub = user.subscription;
    if (existingSub) {
      if (
        existingSub.billingProvider === "MANUAL" &&
        existingSub.status === "ACTIVE" &&
        subscriptionGrantsAccess(existingSub, now)
      ) {
        throw new BillingError(
          "MANUAL_SUBSCRIPTION_ACTIVE",
          409,
          "Sua conta possui uma assinatura manual ativa.",
        );
      }

      if (
        existingSub.billingProvider === "ASAAS" &&
        ((existingSub.status === "ACTIVE" && !existingSub.cancelAtPeriodEnd) ||
          (existingSub.status === "PAST_DUE" &&
            existingSub.graceUntil !== null &&
            existingSub.graceUntil > now))
      ) {
        throw new BillingError(
          "SUBSCRIPTION_ALREADY_ACTIVE",
          409,
          "Você já possui uma assinatura ativa. Utilize upgrade ou alteração de plano.",
        );
      }

      // Idempotência: retorna checkout pendente aberto para o mesmo plano e ciclo
      const existingPendingPayment =
        await prisma.subscriptionPayment.findFirst({
          where: {
            subscriptionId: existingSub.id,
            planId: plan.id,
            billingCycle,
            status: { in: ["CREATED", "PENDING"] },
            checkoutUrl: { not: null },
            createdAt: {
              gte: new Date(now.getTime() - 72 * 60 * 60 * 1000),
            },
          },
          orderBy: { createdAt: "desc" },
        });

      if (existingPendingPayment?.checkoutUrl) {
        return {
          subscriptionId: existingSub.id,
          planCode: plan.code,
          planName: plan.name,
          billingCycle,
          checkoutUrl: existingPendingPayment.checkoutUrl,
          status: existingSub.status,
          reusedExistingCheckout: true,
          message: "Retornado link de pagamento já existente.",
        };
      }
    }

    const subscription = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.subscription.findUnique({
        where: { userId: user.id },
        include: { plan: true },
      });

      const activeTrial =
        current &&
        current.status === "TRIALING" &&
        current.trialEndsAt !== null &&
        current.trialEndsAt > now;

      const activeAthleteFree =
        current &&
        user.accountType === "ATHLETE" &&
        current.plan.code === "ATHLETE_FREE" &&
        current.status === "ACTIVE";

      if (!current) {
        const created = await tx.subscription.create({
          data: {
            userId: user.id,
            planId: plan.id,
            status: "PENDING",
            billingProvider: "ASAAS",
            billingCycle,
            priceInCentsSnapshot: cyclePriceInCents,
            currencySnapshot: plan.currency,
          },
        });
        await logBillingAccessChange(tx, {
          subscriptionId: created.id,
          userId: user.id,
          action: "CHECKOUT_STARTED",
          previousStatus: null,
          newStatus: "PENDING",
          reason: `PLAN_${plan.code}_${billingCycle}`,
          source: "START_SUBSCRIPTION",
          sourceReferenceId: created.id,
        });
        return created;
      }

      // Preserva acesso gratuito ou período de avaliação até a confirmação real do pagamento
      if (activeTrial || activeAthleteFree) {
        await logBillingAccessChange(tx, {
          subscriptionId: current.id,
          userId: user.id,
          action: "CHECKOUT_STARTED",
          previousStatus: current.status,
          newStatus: current.status,
          reason: `UPGRADE_CHECKOUT_${plan.code}_${billingCycle}`,
          source: "START_SUBSCRIPTION",
          sourceReferenceId: current.id,
        });
        return current;
      }

      const updated = await tx.subscription.update({
        where: { id: current.id },
        data: {
          planId: plan.id,
          status: "PENDING",
          billingProvider: "ASAAS",
          billingCycle,
          priceInCentsSnapshot: cyclePriceInCents,
          currencySnapshot: plan.currency,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          blockedAt: null,
        },
      });
      await logBillingAccessChange(tx, {
        subscriptionId: updated.id,
        userId: user.id,
        action: "CHECKOUT_STARTED",
        previousStatus: current.status,
        newStatus: "PENDING",
        reason: `PLAN_${plan.code}_${billingCycle}`,
        source: "START_SUBSCRIPTION",
        sourceReferenceId: updated.id,
      });
      return updated;
    });

    const externalReference = buildSubscriptionCheckoutExternalReference(
      subscription.id,
      plan.id,
    );

    const checkoutResult = await this.asaasClient.createSubscriptionCheckout({
      planName: billingCycle === "YEARLY" ? `${plan.name} (Anual)` : plan.name,
      planDescription: plan.description,
      monthlyPriceInCents: cyclePriceInCents,
      billingCycle,
      externalReference,
      userId: user.id,
      subscriptionId: subscription.id,
    });

    if (!checkoutResult?.url) {
      throw new BillingError(
        "ASAAS_CHECKOUT_FAILED",
        502,
        "Não foi possível iniciar o pagamento da assinatura. Tente novamente em instantes.",
      );
    }

    await prisma.subscriptionPayment.create({
      data: {
        subscriptionId: subscription.id,
        planId: plan.id,
        billingCycle,
        provider: "ASAAS",
        providerCheckoutId: checkoutResult.checkoutId,
        status: "CREATED",
        billingType: "UNDEFINED",
        amountInCents: cyclePriceInCents,
        currency: plan.currency,
        checkoutUrl: checkoutResult.url,
      },
    });

    return {
      subscriptionId: subscription.id,
      planCode: plan.code,
      planName: plan.name,
      billingCycle,
      checkoutUrl: checkoutResult.url,
      status: subscription.status,
      reusedExistingCheckout: false,
      message: "Link de pagamento da assinatura criado com sucesso.",
    };
  }
}
