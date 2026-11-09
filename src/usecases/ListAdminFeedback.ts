import type { FeedbackCategory } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { assertAdminUser } from "../lib/require-admin.js";
export class ListAdminFeedback {
  async execute(input: {
    adminUserId: string;
    cursor?: string;
    category?: FeedbackCategory;
    limit: number;
  }) {
    await assertAdminUser(prisma, input.adminUserId);
    const items = await prisma.feedback.findMany({
      where: { category: input.category },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: { user: { select: { name: true, email: true } } },
    });
    const hasMore = items.length > input.limit;
    const page = items.slice(0, input.limit);
    return {
      items: page.map((item) => ({
        id: item.id,
        category: item.category,
        message: item.message,
        createdAt: item.createdAt.toISOString(),
        user: item.user,
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }
}
