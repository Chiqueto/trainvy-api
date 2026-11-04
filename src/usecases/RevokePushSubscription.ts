import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  endpoint: string;
}

export class RevokePushSubscription {
  async execute(dto: InputDto): Promise<{ success: boolean }> {
    await prisma.pushSubscription.deleteMany({
      where: {
        userId: dto.userId,
        endpoint: dto.endpoint,
      },
    });

    return { success: true };
  }
}

