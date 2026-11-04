import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
}

export class MarkAllNotificationsRead {
  async execute(dto: InputDto): Promise<{ success: boolean; count: number }> {
    const result = await prisma.notification.updateMany({
      where: {
        userId: dto.userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return {
      success: true,
      count: result.count,
    };
  }
}

