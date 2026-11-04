import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  streakReminder?: boolean;
  streakReminderHour?: number;
  coachLinked?: boolean;
  workoutAssigned?: boolean;
}

export class UpdateNotificationPreferences {
  async execute(dto: InputDto) {
    const preferences = await prisma.notificationPreferences.upsert({
      where: { userId: dto.userId },
      create: {
        userId: dto.userId,
        streakReminder: dto.streakReminder ?? true,
        streakReminderHour: dto.streakReminderHour ?? 8,
        coachLinked: dto.coachLinked ?? true,
        workoutAssigned: dto.workoutAssigned ?? true,
      },
      update: {
        ...(dto.streakReminder !== undefined
          ? { streakReminder: dto.streakReminder }
          : {}),
        ...(dto.streakReminderHour !== undefined
          ? { streakReminderHour: dto.streakReminderHour }
          : {}),
        ...(dto.coachLinked !== undefined
          ? { coachLinked: dto.coachLinked }
          : {}),
        ...(dto.workoutAssigned !== undefined
          ? { workoutAssigned: dto.workoutAssigned }
          : {}),
      },
    });

    return {
      streakReminder: preferences.streakReminder,
      streakReminderHour: preferences.streakReminderHour,
      coachLinked: preferences.coachLinked,
      workoutAssigned: preferences.workoutAssigned,
    };
  }
}

