import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { prisma } from "../lib/db.js";
import { calculateWorkoutStreak } from "../lib/streak.js";
import { sendPushToUser } from "../services/SendPushToUser.js";

dayjs.extend(utc);

export class SendStreakReminders {
  async execute(): Promise<number> {
    const candidates = await prisma.user.findMany({
      where: {
        workoutPlans: { some: { isActive: true } },
      },
      select: {
        id: true,
        name: true,
      },
    });

    let sentCount = 0;
    const now = dayjs.utc();
    // Default to BRT (-180 minutes / UTC-3) if not specified
    const timezoneOffset = -180;
    const currentDate = now.utcOffset(timezoneOffset);
    const todayStr = currentDate.format("YYYY-MM-DD");

    for (const user of candidates) {
      const activeWorkoutPlan = await prisma.workoutPlan.findFirst({
        where: {
          userId: user.id,
          isActive: true,
        },
        include: {
          workoutDays: {
            include: {
              sessions: {
                where: { completedAt: { not: null } },
                select: {
                  startedAt: true,
                  completedAt: true,
                },
              },
            },
          },
        },
      });

      if (!activeWorkoutPlan) continue;

      const freeSessions = await prisma.workoutSession.findMany({
        where: {
          athleteId: user.id,
          workoutDayId: null,
          completedAt: { not: null },
        },
        select: {
          startedAt: true,
          completedAt: true,
        },
      });

      // Checar se já completou algum treino hoje
      const allCompletedSessions = [
        ...activeWorkoutPlan.workoutDays.flatMap((d) => d.sessions),
        ...freeSessions,
      ];

      const completedToday = allCompletedSessions.some((s) => {
        if (!s.completedAt) return false;
        return (
          dayjs
            .utc(s.completedAt)
            .utcOffset(timezoneOffset)
            .format("YYYY-MM-DD") === todayStr
        );
      });

      if (completedToday) continue;

      // Calcular streak
      const streak = calculateWorkoutStreak({
        workoutDays: activeWorkoutPlan.workoutDays,
        currentDate,
        timezoneOffset,
        additionalSessions: freeSessions,
      });

      if (streak === 0) continue;

      const sent = await sendPushToUser({
        userId: user.id,
        title: "🔥 Não perca sua sequência!",
        body: `Você está com ${streak} dia${streak > 1 ? "s" : ""} seguido${streak > 1 ? "s" : ""}. Bora treinar hoje?`,
        type: "STREAK_REMINDER",
        url: "/",
      });

      if (sent) {
        sentCount++;
      }
    }

    return sentCount;
  }
}
