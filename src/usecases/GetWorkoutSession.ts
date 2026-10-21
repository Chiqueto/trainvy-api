import { NotFoundError } from "../errors/index.js";
import { SetType, WorkoutSessionOrigin } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  sessionId: string;
}

export interface WorkoutSetOutputDto {
  id: string;
  order: number;
  type: SetType;
  weightInGrams: number | null;
  reps: number | null;
  rir: number | null;
  durationInSeconds: number | null;
  notes: string | null;
  completedAt: string | null;
}

export interface SessionExerciseOutputDto {
  id: string;
  exerciseId?: string | null;
  hasMedia?: boolean;
  exerciseNameSnapshot: string;
  order: number;
  plannedExerciseId?: string | null;
  plannedExerciseNameSnapshot?: string | null;
  alternative1ExerciseId?: string | null;
  alternative1ExerciseNameSnapshot?: string | null;
  alternative2ExerciseId?: string | null;
  alternative2ExerciseNameSnapshot?: string | null;
  wasSubstituted: boolean;
  substitutedAt?: string | null;
  plannedWarmupSets?: number | null;
  plannedSets: number | null;
  plannedReps: number | null;
  plannedRestTimeInSeconds: number | null;
  notes: string | null;
  isUnilateral?: boolean;
  sets: WorkoutSetOutputDto[];
}

export interface GetWorkoutSessionOutputDto {
  id: string;
  origin?: WorkoutSessionOrigin;
  workoutDayId: string | null;
  workoutPlanId?: string | null;
  workoutPlanNameSnapshot?: string | null;
  workoutDayNameSnapshot?: string | null;
  startedAt: string;
  completedAt: string | null;
  sessionExercises: SessionExerciseOutputDto[];
}

export class GetWorkoutSession {
  async execute(dto: InputDto): Promise<GetWorkoutSessionOutputDto> {
    const session = await prisma.workoutSession.findUnique({
      where: { id: dto.sessionId },
      include: {
        sessionExercises: {
          orderBy: { order: "asc" },
          include: {
            exercise: {
              select: {
                id: true,
                name: true,
                isUnilateral: true,
                media: {
                  where: { isActive: true },
                  select: { id: true },
                  take: 1,
                },
              },
            },
            sets: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });

    if (!session || session.athleteId !== dto.userId) {
      throw new NotFoundError("Workout session not found");
    }

    return {
      id: session.id,
      origin: session.origin,
      workoutDayId: session.workoutDayId,
      workoutPlanId: session.workoutPlanId,
      workoutPlanNameSnapshot: session.workoutPlanNameSnapshot,
      workoutDayNameSnapshot: session.workoutDayNameSnapshot,
      startedAt: session.startedAt.toISOString(),
      completedAt: session.completedAt ? session.completedAt.toISOString() : null,
      sessionExercises: session.sessionExercises.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId ?? null,
        hasMedia: Boolean(
          exercise.exercise?.media && exercise.exercise.media.length > 0,
        ),
        exerciseNameSnapshot: exercise.exerciseNameSnapshot,
        order: exercise.order,
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
        plannedWarmupSets: exercise.plannedWarmupSets,
        plannedSets: exercise.plannedSets,
        plannedReps: exercise.plannedReps,
        plannedRestTimeInSeconds: exercise.plannedRestTimeInSeconds,
        notes: exercise.notes,
        isUnilateral: Boolean(exercise.exercise?.isUnilateral),
        sets: exercise.sets.map((set) => ({
          id: set.id,
          order: set.order,
          type: set.type,
          weightInGrams: set.weightInGrams,
          reps: set.reps,
          rir: set.rir,
          durationInSeconds: set.durationInSeconds,
          notes: set.notes,
          completedAt: set.completedAt ? set.completedAt.toISOString() : null,
        })),
      })),
    };
  }
}
