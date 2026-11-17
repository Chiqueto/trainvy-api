import {
  addDays,
  CANONICAL_MUSCLE_ORDER,
  getTodayLocalDate,
  validateIanaTimezone,
} from "../domain/analytics-dates.js";
import { computeSessionDurationInSeconds } from "../domain/history-metrics.js";
import { prisma } from "../lib/db.js";

export interface TrainingWeekRow {
  sessionId: string;
  startedAt: Date;
  completedAt: Date;
  localDate: string;
  setId: string | null;
  reps: number | null;
  weightInGrams: number | null;
  muscleGroup: string | null;
  role: string | null;
}

export function currentWeekRange(tz: string, now = new Date()) {
  const today = getTodayLocalDate(validateIanaTimezone(tz), now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const startDate = addDays(today, -weekday);
  return { startDate, endDate: addDays(startDate, 6) };
}

// Deduplicate after the muscle join: each set counts once in totals and once per role/group.
export function summarizeTrainingWeek(rows: TrainingWeekRow[]) {
  const sessions = new Map<string, TrainingWeekRow>();
  const sets = new Map<string, TrainingWeekRow>();
  const muscles = CANONICAL_MUSCLE_ORDER.map((muscleGroup) => ({
    muscleGroup,
    directWorkingSets: 0,
    indirectWorkingSets: 0,
    directLoadVolumeKg: 0,
  }));
  const seenMuscles = new Set<string>();
  const classified = new Set<string>();
  for (const row of rows) {
    sessions.set(row.sessionId, row);
    if (!row.setId) continue;
    sets.set(row.setId, row);
    const muscle = muscles.find((m) => m.muscleGroup === row.muscleGroup);
    if (!muscle || !row.role) continue;
    classified.add(row.setId);
    const key = `${row.setId}:${row.muscleGroup}:${row.role}`;
    if (seenMuscles.has(key)) continue;
    seenMuscles.add(key);
    if (row.role === "PRIMARY") {
      muscle.directWorkingSets++;
      muscle.directLoadVolumeKg +=
        ((row.weightInGrams ?? 0) * (row.reps ?? 0)) / 1000;
    } else if (row.role === "SECONDARY") muscle.indirectWorkingSets++;
  }
  const attributes = {
    shortReps: 0,
    mediumReps: 0,
    longReps: 0,
    withoutReps: 0,
  };
  let loadVolumeKg = 0;
  for (const set of sets.values()) {
    loadVolumeKg += ((set.weightInGrams ?? 0) * (set.reps ?? 0)) / 1000;
    if (set.reps === null || set.reps <= 0) attributes.withoutReps++;
    else if (set.reps <= 5) attributes.shortReps++;
    else if (set.reps < 15) attributes.mediumReps++;
    else attributes.longReps++;
  }
  const days = new Map<string, number>();
  let durationInSeconds = 0;
  for (const session of sessions.values()) {
    days.set(session.localDate, (days.get(session.localDate) ?? 0) + 1);
    durationInSeconds += computeSessionDurationInSeconds(
      session.startedAt,
      session.completedAt,
    );
  }
  return {
    workoutsCompleted: sessions.size,
    workingSets: sets.size,
    loadVolumeKg,
    durationInSeconds,
    unclassifiedWorkingSets: sets.size - classified.size,
    attributes,
    muscles,
    days: [...days].map(([date, workoutsCompleted]) => ({
      date,
      workoutsCompleted,
    })),
  };
}

export class GetCurrentTrainingWeek {
  constructor(private readonly prismaClient = prisma) {}

  async execute(input: { userId: string; tz: string }) {
    const timezone = validateIanaTimezone(input.tz);
    const { startDate, endDate } = currentWeekRange(timezone);
    const rows = await this.prismaClient.$queryRaw<TrainingWeekRow[]>`
      SELECT ws.id AS "sessionId", ws."startedAt", ws."completedAt",
        TO_CHAR(ws."completedAt" AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS "localDate",
        s.id AS "setId", s.reps, s."weightInGrams", em."muscleGroup"::text AS "muscleGroup", em.role::text AS role
      FROM "WorkoutSession" ws
      LEFT JOIN "SessionExercise" se ON se."workoutSessionId" = ws.id
      LEFT JOIN "WorkoutSet" s ON s."sessionExerciseId" = se.id
        AND s.type = 'WORKING' AND s."completedAt" IS NOT NULL
      LEFT JOIN "ExerciseMuscle" em ON em."exerciseId" = COALESCE(s."exerciseId", se."exerciseId") AND s.id IS NOT NULL
      WHERE ws."athleteId" = ${input.userId} AND ws."completedAt" IS NOT NULL
        AND ws."completedAt" >= (${startDate}::timestamp AT TIME ZONE ${timezone})
        AND ws."completedAt" < ((${endDate}::timestamp + INTERVAL '1 day') AT TIME ZONE ${timezone})
    `;
    return { startDate, endDate, timezone, ...summarizeTrainingWeek(rows) };
  }
}
