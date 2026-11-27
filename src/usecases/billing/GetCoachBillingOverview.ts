import { BillingError } from "../../domain/billing.js";
import { subscriptionGrantsAccess } from "../../domain/commercial.js";
import { prisma } from "../../lib/db.js";
import { DowngradeCoachSubscription } from "./DowngradeCoachSubscription.js";
import { UpgradeCoachSubscription } from "./UpgradeCoachSubscription.js";

export class GetCoachBillingOverview {
  async execute(userId: string) {
    const now = new Date();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: {
          include: {
            plan: { include: { entitlements: true } },
            payments: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
            refunds: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        },
      },
    });

    if (!user || user.deletedAt) {
      throw new BillingError("USER_NOT_FOUND", 404, "Usuário não encontrado.");
    }
    if (user.accountType !== "COACH" && user.accountType !== "ATHLETE") {
      throw new BillingError(
        "BILLING_NOT_AVAILABLE",
        403,
        "Faturamento disponível apenas para contas de treinador ou atleta.",
      );
    }

    const plans = await prisma.plan.findMany({
      where: {
        audience: user.accountType,
        isPublic: true,
        isActive: true,
      },
      include: { entitlements: { orderBy: { entitlement: "asc" } } },
      orderBy: [{ sortOrder: "asc" }, { monthlyPriceInCents: "asc" }],
    });

    const sub = user.subscription;
    const pendingCheckout = sub?.payments.find(
      (p) =>
        ["CREATED", "PENDING"].includes(p.status) && p.checkoutUrl !== null,
    );

    const [pendingUpgrade, pendingDowngrade] = await Promise.all([
      new UpgradeCoachSubscription().getPending(userId),
      new DowngradeCoachSubscription().getPending(userId),
    ]);

    const accessActive =
      user.accountSetupCompletedAt !== null &&
      sub !== null &&
      subscriptionGrantsAccess(sub, now);

    return {
      accessActive,
      pendingCheckoutUrl: pendingCheckout?.checkoutUrl ?? null,
      subscription: sub
        ? {
            id: sub.id,
            planCode: sub.plan.code,
            planName: sub.plan.name,
            monthlyPriceInCents: sub.priceInCentsSnapshot,
            currency: sub.currencySnapshot,
            status: sub.status,
            billingProvider: sub.billingProvider,
            billingCycle: sub.billingCycle,
            trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
            currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
            paidUntil: sub.paidUntil?.toISOString() ?? null,
            graceUntil: sub.graceUntil?.toISOString() ?? null,
            coolingOffUntil: sub.coolingOffUntil?.toISOString() ?? null,
            nextDueDate: sub.nextDueDate
              ? sub.nextDueDate.toISOString().slice(0, 10)
              : null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            canceledAt: sub.canceledAt?.toISOString() ?? null,
          }
        : null,
      pendingUpgrade,
      pendingDowngrade,
      payments: (sub?.payments ?? []).map((p) => ({
        id: p.id,
        status: p.status,
        billingType: p.billingType,
        billingCycle: p.billingCycle,
        amountInCents: p.amountInCents,
        netAmountInCents: p.netAmountInCents,
        currency: p.currency,
        dueDate: p.dueDate ? p.dueDate.toISOString().slice(0, 10) : null,
        confirmedAt: p.confirmedAt?.toISOString() ?? null,
        receivedAt: p.receivedAt?.toISOString() ?? null,
        refundedAt: p.refundedAt?.toISOString() ?? null,
        checkoutUrl: p.checkoutUrl,
        invoiceUrl: p.invoiceUrl,
        bankSlipUrl: p.bankSlipUrl,
        createdAt: p.createdAt.toISOString(),
      })),
      refunds: (sub?.refunds ?? []).map((r) => ({
        id: r.id,
        refundType: r.refundType,
        status: r.status,
        reason: r.reason,
        amountInCents: r.amountInCents,
        currency: r.currency,
        requestedAt: r.requestedAt.toISOString(),
        processedAt: r.processedAt?.toISOString() ?? null,
        failedAt: r.failedAt?.toISOString() ?? null,
      })),
      availablePlans: plans.map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description,
        monthlyPriceInCents: p.monthlyPriceInCents,
        annualPriceInCents: p.annualPriceInCents,
        currency: p.currency,
        entitlements: p.entitlements.map((e) => ({
          entitlement: e.entitlement,
          limitValue: e.limitValue,
        })),
      })),
    };
  }
}
