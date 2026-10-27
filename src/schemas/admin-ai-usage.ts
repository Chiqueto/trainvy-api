import z from "zod";
export const AdminAiUsageQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  userId: z.string().trim().min(1).max(128).optional(),
});
const totals = z.object({
  calls: z.number(), inputTokens: z.number(), outputTokens: z.number(), reasoningTokens: z.number(),
  cachedInputTokens: z.number(), estimatedCostUsd: z.number(), unpricedCalls: z.number(), errors: z.number(),
});
export const AdminAiUsageResponse = z.object({
  from: z.string(), to: z.string(), trackingStartedAt: z.string().nullable(), pricingSource: z.string(), pricingVersion: z.string(),
  totals,
  byFeature: z.array(totals.extend({ feature: z.string(), model: z.string() })),
  byUser: z.array(totals.extend({ userId: z.string(), name: z.string(), email: z.string() })),
  daily: z.array(z.object({ date: z.string(), calls: z.number(), estimatedCostUsd: z.number() })),
  recent: z.array(z.object({ id: z.string(), userId: z.string(), feature: z.string(), model: z.string(), status: z.string(),
    inputTokens: z.number().nullable(), outputTokens: z.number().nullable(), estimatedCostUsd: z.number().nullable(), createdAt: z.string() })),
});
