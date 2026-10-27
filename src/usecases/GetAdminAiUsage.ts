import { AI_PRICING_SOURCE, AI_PRICING_VERSION } from "../domain/ai-usage.js";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { assertAdminUser } from "../lib/require-admin.js";

type Aggregate = {
  _count: { _all: number; estimatedCostUsd: number };
  _sum: {
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    cachedInputTokens: number | null;
    estimatedCostUsd: Prisma.Decimal | null;
  };
};
const aggregation = {
  _count: { _all: true, estimatedCostUsd: true },
  _sum: {
    inputTokens: true,
    outputTokens: true,
    reasoningTokens: true,
    cachedInputTokens: true,
    estimatedCostUsd: true,
  },
} as const;
const totals = (a: Aggregate, errors: number) => ({
  calls: a._count._all,
  inputTokens: a._sum.inputTokens ?? 0,
  outputTokens: a._sum.outputTokens ?? 0,
  reasoningTokens: a._sum.reasoningTokens ?? 0,
  cachedInputTokens: a._sum.cachedInputTokens ?? 0,
  estimatedCostUsd: Number(a._sum.estimatedCostUsd ?? 0),
  unpricedCalls: a._count._all - a._count.estimatedCostUsd,
  errors,
});

export class GetAdminAiUsage {
  async execute(adminUserId: string, query: { days: number; userId?: string }) {
    await assertAdminUser(prisma, adminUserId);
    const to = new Date();
    const from = new Date(to);
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - query.days + 1);
    const where = {
      createdAt: { gte: from, lte: to },
      ...(query.userId ? { userId: query.userId } : {}),
    };
    const [total, features, users, errors, recent, first, daily] =
      await Promise.all([
        prisma.aiUsageEvent.aggregate({ where, ...aggregation }),
        prisma.aiUsageEvent.groupBy({
          by: ["feature", "model"],
          where,
          ...aggregation,
        }),
        prisma.aiUsageEvent.groupBy({ by: ["userId"], where, ...aggregation }),
        prisma.aiUsageEvent.groupBy({
          by: ["feature", "model", "userId"],
          where: { ...where, status: "ERROR" },
          _count: { _all: true },
        }),
        prisma.aiUsageEvent.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 30,
        }),
        prisma.aiUsageEvent.findFirst({
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        prisma.$queryRaw<
          Array<{ date: string; calls: bigint; cost: Prisma.Decimal | null }>
        >`
        SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, COUNT(*) AS calls,
          SUM("estimatedCostUsd") AS cost FROM "AiUsageEvent"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
          AND (${query.userId ?? null}::text IS NULL OR "userId" = ${query.userId ?? null})
        GROUP BY date ORDER BY date`,
      ]);
    const topUsers = users
      .sort(
        (a, b) =>
          Number(b._sum.estimatedCostUsd ?? 0) -
            Number(a._sum.estimatedCostUsd ?? 0) ||
          b._count._all - a._count._all ||
          a.userId.localeCompare(b.userId),
      )
      .slice(0, 20);
    const names = await prisma.user.findMany({
      where: { id: { in: topUsers.map((u) => u.userId) } },
      select: { id: true, name: true, email: true },
    });
    const errorCount = (predicate: (e: (typeof errors)[number]) => boolean) =>
      errors.filter(predicate).reduce((sum, e) => sum + e._count._all, 0);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      trackingStartedAt: first?.createdAt.toISOString() ?? null,
      pricingSource: AI_PRICING_SOURCE,
      pricingVersion: AI_PRICING_VERSION,
      totals: totals(
        total,
        errorCount(() => true),
      ),
      byFeature: features.map((f) => ({
        feature: f.feature,
        model: f.model,
        ...totals(
          f,
          errorCount((e) => e.feature === f.feature && e.model === f.model),
        ),
      })),
      byUser: topUsers.map((u) => ({
        userId: u.userId,
        name: names.find((n) => n.id === u.userId)?.name ?? "Usuário removido",
        email: names.find((n) => n.id === u.userId)?.email ?? "",
        ...totals(
          u,
          errorCount((e) => e.userId === u.userId),
        ),
      })),
      daily: daily.map((d) => ({
        date: d.date,
        calls: Number(d.calls),
        estimatedCostUsd: Number(d.cost ?? 0),
      })),
      recent: recent.map((e) => ({
        ...e,
        estimatedCostUsd:
          e.estimatedCostUsd === null ? null : Number(e.estimatedCostUsd),
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }
}
