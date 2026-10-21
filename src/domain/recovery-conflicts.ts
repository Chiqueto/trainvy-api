import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

import { prisma } from "../lib/db.js";
import type { WorkoutRecoveryConflictDetails } from "../schemas/index.js";

dayjs.extend(utc);
dayjs.extend(timezone);

interface CheckRecoveryConflictsInput {
  userId: string;
  sessionDateStr: string; // "YYYY-MM-DD"
  timezone: string;
  workoutDayId?: string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  excludeSessionId?: string | null;
}

/**
 * Detecta potenciais conflitos de treinos passados no fuso do atleta,
 * diferenciando:
 * 1. Mesmo plano/dia de treino (alta probabilidade de duplicação)
 * 2. Horários com sobreposição (caso ambos os treinos tenham horários conhecidos)
 * 3. Outro treino no mesmo dia civil (dois treinos legítimos, exige apenas aviso/confirmação explícita)
 */
export async function checkRecoveryConflicts(
  input: CheckRecoveryConflictsInput,
): Promise<WorkoutRecoveryConflictDetails> {
  const {
    userId,
    sessionDateStr,
    timezone: userTz,
    workoutDayId,
    startedAt,
    completedAt,
    excludeSessionId,
  } = input;

  // Janela do dia civil local no fuso do atleta convertida para UTC
  const startOfDayUtc = dayjs.tz(`${sessionDateStr} 00:00:00`, userTz).toDate();
  const endOfDayUtc = dayjs.tz(`${sessionDateStr} 23:59:59.999`, userTz).toDate();
  const sessionDateDb = new Date(`${sessionDateStr}T00:00:00.000Z`);

  const whereConditions: any = {
    athleteId: userId,
    OR: [
      { sessionDate: sessionDateDb },
      {
        startedAt: {
          gte: startOfDayUtc,
          lte: endOfDayUtc,
        },
      },
    ],
  };

  if (excludeSessionId) {
    whereConditions.id = { not: excludeSessionId };
  }

  const existingSessions = await prisma.workoutSession.findMany({
    where: whereConditions,
    select: {
      id: true,
      sessionDate: true,
      startedAt: true,
      completedAt: true,
      workoutPlanNameSnapshot: true,
      workoutDayNameSnapshot: true,
      workoutDayId: true,
      timePrecision: true,
      isRetroactive: true,
    },
    orderBy: { startedAt: "asc" },
  });

  if (existingSessions.length === 0) {
    return {
      hasConflict: false,
      reason: null,
      conflictingSessions: [],
    };
  }

  // Avalia se há colisão idêntica de prescrição ou sobreposição de horário
  const conflictingMapped = existingSessions.map((s) => ({
    id: s.id,
    sessionDate: s.sessionDate ? s.sessionDate.toISOString().split("T")[0] : null,
    startedAt: s.startedAt.toISOString(),
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    workoutPlanNameSnapshot: s.workoutPlanNameSnapshot,
    workoutDayNameSnapshot: s.workoutDayNameSnapshot,
    workoutDayId: s.workoutDayId,
    timePrecision: s.timePrecision,
    isRetroactive: s.isRetroactive,
  }));

  // 1. Mesmo workoutDayId
  if (workoutDayId && existingSessions.some((s) => s.workoutDayId === workoutDayId)) {
    return {
      hasConflict: true,
      reason: "Já existe uma sessão registrada para o mesmo dia de treino nesta data.",
      conflictingSessions: conflictingMapped,
    };
  }

  // 2. Sobreposição horária quando ambos têm horários conhecidos
  if (startedAt && completedAt) {
    const newStartMs = new Date(startedAt).getTime();
    const newEndMs = new Date(completedAt).getTime();

    const hasTimeOverlap = existingSessions.some((s) => {
      if (s.timePrecision === "EXACT_TIME" && s.completedAt) {
        const existStartMs = s.startedAt.getTime();
        const existEndMs = s.completedAt.getTime();
        return newStartMs < existEndMs && newEndMs > existStartMs;
      }
      return false;
    });

    if (hasTimeOverlap) {
      return {
        hasConflict: true,
        reason: "O horário informado sobrepõe o intervalo de outra sessão de treino.",
        conflictingSessions: conflictingMapped,
      };
    }
  }

  // 3. Outro treino na mesma data civil
  return {
    hasConflict: true,
    reason: "Já existe outra sessão de treino registrada nesta data. Deseja confirmar como um segundo treino?",
    conflictingSessions: conflictingMapped,
  };
}
