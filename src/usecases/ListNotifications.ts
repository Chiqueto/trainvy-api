import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  cursor?: string;
  limit: number;
}

export class ListNotifications {
  async execute(dto: InputDto) {
    const limit = dto.limit || 20;

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: dto.userId },
        orderBy: { sentAt: "desc" },
        take: limit + 1,
        ...(dto.cursor
          ? {
              cursor: { id: dto.cursor },
              skip: 1,
            }
          : {}),
      }),
      prisma.notification.count({
        where: { userId: dto.userId, readAt: null },
      }),
    ]);

    let nextCursor: string | null = null;
    const notifications = [...items];
    if (notifications.length > limit) {
      const nextItem = notifications.pop();
      nextCursor = nextItem?.id ?? null;
    }

    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        sentAt: n.sentAt.toISOString(),
      })),
      unreadCount,
      nextCursor,
    };
  }
}

