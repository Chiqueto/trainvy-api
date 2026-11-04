import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export class RegisterPushSubscription {
  async execute(dto: InputDto): Promise<{ id: string }> {
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId: dto.userId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.userAgent,
      },
      update: {
        userId: dto.userId,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.userAgent,
      },
    });

    await prisma.notificationPreferences.upsert({
      where: { userId: dto.userId },
      create: { userId: dto.userId },
      update: {},
    });

    return { id: subscription.id };
  }
}

