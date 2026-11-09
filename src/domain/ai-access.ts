import type { EntitlementKey } from "../generated/prisma/client.js";

export type AiEntitlement = Extract<
  EntitlementKey,
  "AI_CHAT" | "AI_PLAN_GENERATION"
>;
export class AiAccessError extends Error {
  readonly code = "AI_ENTITLEMENT_REQUIRED";
  readonly statusCode = 403;
  constructor() {
    super(
      "Seu plano não inclui este recurso de IA. Consulte o suporte para alterar o plano.",
    );
  }
}
export function resolveAiAccess(
  context: {
    accountType: string;
    plan: { name: string; code: string } | null;
    entitlements: { key: string; limitValue: number | null }[];
  },
  entitlement: AiEntitlement = "AI_CHAT",
) {
  const enabled = context.entitlements.some(
    (entry) => entry.key === entitlement,
  );
  const caps = context.entitlements
    .filter(
      (entry) => entry.key === "AI_CHAT" || entry.key === "AI_PLAN_GENERATION",
    )
    .map((entry) => entry.limitValue)
    .filter((value): value is number => value !== null);
  if (caps.some((value) => !Number.isSafeInteger(value) || value < 0))
    throw new Error("Invalid AI quota configuration");
  return {
    enabled,
    dailyLimit: enabled
      ? caps.length
        ? Math.min(...caps)
        : context.plan?.code === "INTERNAL"
          ? 200
          : context.accountType === "COACH"
            ? 30
            : 5
      : 0,
    isAthlete: context.accountType === "ATHLETE",
    planName: context.plan?.name ?? null,
  };
}
