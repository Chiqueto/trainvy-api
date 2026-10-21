import {
  computeExercisePerformedMetrics,
  computeSessionDurationInSeconds,
} from "../domain/history-metrics.js";
import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  sessionId: string;
  minCompletedAt?: Date;
}

export interface HistorySetDetailDto {
  id: string;
  order: number;
  type: "WARMUP" | "WORKING";
  weightInGrams: number | null;
  reps: number | null;
  rir: number | null;
  durationInSeconds: number | null;
  notes: string | null;
  completedAt: string;
  exerciseId?: string | null;
  exerciseNameSnapshot?: string | null;
  proposalId?: string | null;
}

export interface HistoryExerciseDetailDto {
  id: string;
  exerciseId: string | null;
  exerciseNameSnapshot: string;
  order: number;
  notes: string | null;
  plannedExerciseId?: string | null;
  plannedExerciseNameSnapshot?: string | null;
  alternative1ExerciseId?: string | null;
  alternative1ExerciseNameSnapshot?: string | null;
  alternative2ExerciseId?: string | null;
  alternative2ExerciseNameSnapshot?: string | null;
  wasSubstituted: boolean;
  substitutedAt?: string | null;
  planned: {
    warmupSets: number | null;
    workingSets: number | null;
    reps: number | null;
    restTimeInSeconds: number | null;
  };
  performed: {
    warmupSetsCount: number;
    workingSetsCount: number;
    loadVolumeGrams: number;
    loadVolumeKg: number;
  };
  sets: HistorySetDetailDto[];
}

export interface GetWorkoutHistorySessionOutputDto {
  id: string;
  origin: "PLANNED" | "FREE";
  startedAt: string;
  completedAt: string;
  durationInSeconds: number | null;
  sessionDate?: string | null;
  timePrecision?: "EXACT_TIME" | "DATE_ONLY";
  isRetroactive?: boolean;
  workoutPlanId: string | null;
  workoutPlanNameSnapshot: string | null;
  workoutDayNameSnapshot: string | null;
  summary: {
    exercisesCount: number;
    workingSetsCount: number;
    warmupSetsCount: number;
    totalLoadVolumeGrams: number;
    totalLoadVolumeKg: number;
  };
  exercises: HistoryExerciseDetailDto[];
}

export class GetWorkoutHistorySession {
  async execute(dto: InputDto): Promise<GetWorkoutHistorySessionOutputDto> {
    const session = await prisma.workoutSession.findFirst({
      where: {
        id: dto.sessionId,
        athleteId: dto.userId,
        completedAt: dto.minCompletedAt
          ? { not: null, gte: dto.minCompletedAt }
          : { not: null },
      },
      include: {
        sessionExercises: {
          orderBy: { order: "asc" },
          include: {
            sets: {
              where: { completedAt: { not: null } },
              orderBy: [
                { order: "asc" },
                { createdAt: "asc" },
                { id: "asc" },
              ],
            },
          },
        },
      },
    });

    if (!session || !session.completedAt) {
      throw new NotFoundError("Workout session not found");
    }

    const durationInSeconds =
      session.timePrecision === "DATE_ONLY"
        ? null
        : computeSessionDurationInSeconds(session.startedAt, session.completedAt);

    let totalWorkingSets = 0;
    let totalWarmupSets = 0;
    let totalLoadVolumeGrams = 0;

    const exercises: HistoryExerciseDetailDto[] = session.sessionExercises.map((exercise) => {
      const performed = computeExercisePerformedMetrics(exercise.sets);

      totalWorkingSets += performed.workingSetsCount;
      totalWarmupSets += performed.warmupSetsCount;
      totalLoadVolumeGrams += performed.loadVolumeGrams;

      const sets: HistorySetDetailDto[] = exercise.sets.map((set) => ({
        id: set.id,
        order: set.order,
        type: set.type as "WARMUP" | "WORKING",
        weightInGrams: set.weightInGrams,
        reps: set.reps,
        rir: set.rir,
        durationInSeconds: set.durationInSeconds,
        notes: set.notes,
        completedAt: set.completedAt!.toISOString(),
        exerciseId: set.exerciseId,
        exerciseNameSnapshot: set.exerciseNameSnapshot,
        proposalId: set.proposalId,
      }));

      return {
        id: exercise.id,
        exerciseId: exercise.exerciseId ?? null,
        exerciseNameSnapshot: exercise.exerciseNameSnapshot,
        order: exercise.order,
        notes: exercise.notes ?? null,
        plannedExerciseId: exercise.plannedExerciseId ?? null,
        plannedExerciseNameSnapshot: exercise.plannedExerciseNameSnapshot ?? null,
        alternative1ExerciseId: exercise.alternative1ExerciseId ?? null,
        alternative1ExerciseNameSnapshot:
          exercise.alternative1ExerciseNameSnapshot ?? null,
        alternative2ExerciseId: exercise.alternative2ExerciseId ?? null,
        alternative2ExerciseNameSnapshot:
          exercise.alternative2ExerciseNameSnapshot ?? null,
        wasSubstituted: exercise.wasSubstituted,
        substitutedAt: exercise.substitutedAt
          ? exercise.substitutedAt.toISOString()
          : null,
        planned: {
          warmupSets: exercise.plannedWarmupSets ?? null,
          workingSets: exercise.plannedSets ?? null,
          reps: exercise.plannedReps ?? null,
          restTimeInSeconds: exercise.plannedRestTimeInSeconds ?? null,
        },
        performed,
        sets,
      };
    });

    return {
      id: session.id,
      origin: session.origin as "PLANNED" | "FREE",
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt.toISOString(),
      durationInSeconds,
      sessionDate: session.sessionDate
        ? session.sessionDate.toISOString().split("T")[0]
        : null,
      timePrecision: session.timePrecision as "EXACT_TIME" | "DATE_ONLY",
      isRetroactive: session.isRetroactive,
      workoutPlanId: session.workoutPlanId ?? null,
      workoutPlanNameSnapshot: session.workoutPlanNameSnapshot ?? null,
      workoutDayNameSnapshot: session.workoutDayNameSnapshot ?? null,
      summary: {
        exercisesCount: exercises.length,
        workingSetsCount: totalWorkingSets,
        warmupSetsCount: totalWarmupSets,
        totalLoadVolumeGrams,
        totalLoadVolumeKg: totalLoadVolumeGrams / 1000,
      },
      exercises,
    };
  }
}
