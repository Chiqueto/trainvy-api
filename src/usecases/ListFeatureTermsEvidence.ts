import type { FeatureKey } from "../domain/feature-terms.js";
import { prisma } from "../lib/db.js";
import { assertAdminUser } from "../lib/require-admin.js";

export class ListFeatureTermsEvidence {
  async execute(
    actorId: string,
    query: {
      userId?: string;
      feature?: FeatureKey;
      cursor?: string;
      limit: number;
    },
  ) {
    await assertAdminUser(prisma, actorId);
    const rows = await prisma.featureTermsAcceptance.findMany({
      where: {
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.feature ? { feature: query.feature } : {}),
      },
      orderBy: { id: "asc" },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        accessEvents: { orderBy: { createdAt: "desc" }, take: 20 },
        _count: { select: { accessEvents: true } },
      },
    });
    const items = rows
      .slice(0, query.limit)
      .map(({ accessEvents, _count, acceptedAt, ...row }) => ({
        ...row,
        acceptedAt: acceptedAt.toISOString(),
        accessCount: _count.accessEvents,
        recentAccessEvents: accessEvents.map((event) => ({
          id: event.id,
          context: event.context,
          createdAt: event.createdAt.toISOString(),
        })),
      }));
    return {
      items,
      nextCursor: rows.length > query.limit ? items.at(-1)!.id : null,
    };
  }
}
