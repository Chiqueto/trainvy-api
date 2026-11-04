import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  id: string;
}

export class MarkNotificationRead {
  async execute(dto: InputDto): Promise<{ success: boolean }> {
    const existing = await prisma.notification.findFirst({
      where: {
        id: dto.id,
        userId: dto.userId,
      },
    });

    if (!existing) {
      throw new NotFoundError("Notificação não encontrada.");
    }

    await prisma.notification.update({
      where: { id: dto.id },
      data: { readAt: new Date() },
    });

    return { success: true };
  }
}

