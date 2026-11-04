import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
}

export class GetNotificationPreferences {
  async execute(dto: InputDto) {
    const preferences = await prisma.notificationPreferences.upsert({
      where: { userId: dto.userId },
      create: { userId: dto.userId },
      update: {},
    });

    return {
      streakReminder: preferences.streakReminder,
      streakReminderHour: preferences.streakReminderHour,
      coachLinked: preferences.coachLinked,
      workoutAssigned: preferences.workoutAssigned,
    };
  }
}

