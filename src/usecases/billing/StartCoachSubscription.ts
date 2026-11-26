import {
  BillingError,
  buildSubscriptionCheckoutExternalReference,
  logBillingAccessChange,
  validCpfOrCnpj,
} from "../../domain/billing.js";
import { subscriptionGrantsAccess } from "../../domain/commercial.js";
import { prisma } from "../../lib/db.js";
import { AsaasClient } from "../../services/AsaasClient.js";

export interface StartCoachSubscriptionInput {
  userId: string;
  planCode: string;
  cpfCnpj: string;
}

export class StartCoachSubscription {
  constructor(private readonly asaasClient = new AsaasClient()) {}

  async execute(input: StartCoachSubscriptionInput) {
    const now = new Date();
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
    if (user.accountType !== "COACH") {
      throw new BillingError(
        "ONLY_COACHES_ALLOWED",
        403,
        "Apenas contas de treinador podem contratar planos profissionais.",
      );
    }

    const plan = await prisma.plan.findUnique({
      where: { code: input.planCode },
      include: { entitlements: true },
    });
    if (
      !plan ||
      !plan.isActive ||
      !plan.isPublic ||
      plan.audience !== "COACH" ||
      plan.monthlyPriceInCents <= 0
    ) {
      throw new BillingError(
        "INVALID_BILLING_PLAN",
        404,
        "Plano ativo disponível para assinatura não encontrado.",
      );
    }

    // Valida limite de alunos do plano escolhido antes do checkout (equivalente ao PlanGatingService do Marca-Lá)
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

      // Idempotência: retorna checkout pendente aberto para o mesmo plano
      const existingPendingPayment =
        await prisma.subscriptionPayment.findFirst({
          where: {
            subscriptionId: existingSub.id,
            planId: plan.id,
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
          checkoutUrl: existingPendingPayment.checkoutUrl,
          status: existingSub.status,
          reusedExistingCheckout: true,
          message: "Retornado link de checkout já existente.",
        };
      }
    }

    const subscription = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.subscription.findUnique({
        where: { userId: user.id },
      });

      const activeTrial =
        current &&
        current.status === "TRIALING" &&
        current.trialEndsAt !== null &&
        current.trialEndsAt > now;

      if (!current) {
        const created = await tx.subscription.create({
          data: {
            userId: user.id,
            planId: plan.id,
            status: "PENDING",
            billingProvider: "ASAAS",
            priceInCentsSnapshot: plan.monthlyPriceInCents,
            currencySnapshot: plan.currency,
          },
        });
        await logBillingAccessChange(tx, {
          subscriptionId: created.id,
          userId: user.id,
          action: "CHECKOUT_STARTED",
          previousStatus: null,
          newStatus: "PENDING",
          reason: `PLAN_${plan.code}`,
          source: "COACH_START_SUBSCRIPTION",
          sourceReferenceId: created.id,
        });
        return created;
      }

      // Se ainda está em trial válido, preserva TRIALING até a confirmação real do pagamento no webhook
      if (activeTrial) {
        await logBillingAccessChange(tx, {
          subscriptionId: current.id,
          userId: user.id,
          action: "CHECKOUT_STARTED",
          previousStatus: current.status,
          newStatus: current.status,
          reason: `TRIAL_EARLY_CHECKOUT_${plan.code}`,
          source: "COACH_START_SUBSCRIPTION",
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
          priceInCentsSnapshot: plan.monthlyPriceInCents,
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
        reason: `PLAN_${plan.code}`,
        source: "COACH_START_SUBSCRIPTION",
        sourceReferenceId: updated.id,
      });
      return updated;
    });

    const externalReference = buildSubscriptionCheckoutExternalReference(
      subscription.id,
      plan.id,
    );

    const checkoutResult = await this.asaasClient.createSubscriptionCheckout({
      planName: plan.name,
      planDescription: plan.description,
      monthlyPriceInCents: plan.monthlyPriceInCents,
      externalReference,
      userId: user.id,
      subscriptionId: subscription.id,
    });

    if (!checkoutResult?.url) {
      throw new BillingError(
        "ASAAS_CHECKOUT_FAILED",
        502,
        "Não foi possível criar o checkout de assinatura no Asaas.",
      );
    }

    await prisma.subscriptionPayment.create({
      data: {
        subscriptionId: subscription.id,
        planId: plan.id,
        provider: "ASAAS",
        providerCheckoutId: checkoutResult.checkoutId,
        status: "CREATED",
        billingType: "UNDEFINED",
        amountInCents: plan.monthlyPriceInCents,
        currency: plan.currency,
        checkoutUrl: checkoutResult.url,
      },
    });

    return {
      subscriptionId: subscription.id,
      planCode: plan.code,
      planName: plan.name,
      checkoutUrl: checkoutResult.url,
      status: subscription.status,
      reusedExistingCheckout: false,
      message: "Checkout de assinatura criado com sucesso.",
    };
  }
}
