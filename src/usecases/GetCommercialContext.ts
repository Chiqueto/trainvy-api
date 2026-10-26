import {
  CommercialError,
  subscriptionGrantsAccess,
} from "../domain/commercial.js";
import { Prisma } from "../generated/prisma/client.js";
import { isConfiguredAdminEmail } from "../lib/admin-config.js";
import { prisma } from "../lib/db.js";

export class GetCommercialContext {
  async execute({
    userId,
    now = new Date(),
    client = prisma,
  }: {
    userId: string;
    now?: Date;
    client?: Prisma.TransactionClient | typeof prisma;
  }) {
    const user = await client.user.findUnique({
      where: { id: userId },
      include: {
        subscription: {
          include: { plan: { include: { entitlements: true } } },
        },
      },
    });
    if (!user) throw new CommercialError("USER_NOT_FOUND", 404);

    if (user.systemRole !== "ADMIN" && isConfiguredAdminEmail(user.email)) {
      user.systemRole = "ADMIN";
      await client.user.update({
        where: { id: user.id },
        data: { systemRole: "ADMIN" },
      });
    }

    const subscription = user.subscription;
    const plan = subscription?.plan;
    const granted =
      user.accountSetupCompletedAt !== null &&
      subscription &&
      plan &&
      subscriptionGrantsAccess(subscription, now);
    return {
      accountType: user.accountType,
      systemRole: user.systemRole,
      accountSetupCompletedAt:
        user.accountSetupCompletedAt?.toISOString() ?? null,
      plan: plan ? { code: plan.code, name: plan.name } : null,
      subscription: subscription
        ? {
            status: subscription.status,
            billingProvider: subscription.billingProvider,
            trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
            currentPeriodEnd:
              subscription.currentPeriodEnd?.toISOString() ?? null,
            priceInCentsSnapshot: subscription.priceInCentsSnapshot,
            currencySnapshot: subscription.currencySnapshot,
          }
        : null,
      entitlements: granted
        ? plan.entitlements.map((e) => ({
            key: e.entitlement,
            limitValue: e.limitValue,
          }))
        : [],
    };
  }
}
