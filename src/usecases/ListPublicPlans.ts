import { prisma } from "../lib/db.js";
import { AiAvailability } from "./AiAvailability.js";

export class ListPublicPlans {
  async execute({ audience }: { audience: "ATHLETE" | "COACH" }) {
    const policy = await new AiAvailability().public();
    return prisma.plan.findMany({
      where: {
        audience,
        isPublic: true,
        isActive: true,
        ...(audience === "COACH" && !policy.professionalAiEnabled
          ? {
              entitlements: {
                none: {
                  entitlement: {
                    in: ["AI_CHAT", "AI_PLAN_GENERATION"] as const,
                  },
                },
              },
            }
          : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: {
        code: true,
        name: true,
        description: true,
        monthlyPriceInCents: true,
        currency: true,
        entitlements: {
          where: { entitlement: { not: "SOURCE_LIBRARY" } },
          select: { entitlement: true, limitValue: true },
          orderBy: { entitlement: "asc" },
        },
      },
    });
  }
}
