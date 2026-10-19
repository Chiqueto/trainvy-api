import {
  NotFoundError,
  WorkoutSessionAlreadyCompletedError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";
import {
  SessionExerciseOutputDto,
} from "./GetWorkoutSession.js";

interface InputDto {
  userId: string;
  sessionId: string;
  sessionExerciseId: string;
  newExerciseId: string;
}

export class SubstituteSessionExercise {
  async execute(dto: InputDto): Promise<SessionExerciseOutputDto> {
    const session = await prisma.workoutSession.findUnique({
      where: { id: dto.sessionId },
    });

    if (!session || session.athleteId !== dto.userId) {
      throw new NotFoundError("Workout session not found");
    }

    if (session.completedAt !== null) {
      throw new WorkoutSessionAlreadyCompletedError(
        "Workout session is already completed",
      );
    }

    const sessionExercise = await prisma.sessionExercise.findFirst({
      where: {
        id: dto.sessionExerciseId,
        workoutSessionId: session.id,
      },
    });

    if (!sessionExercise) {
      throw new NotFoundError("Session exercise not found");
    }

    const targetExercise = await prisma.exercise.findFirst({
      where: {
        id: dto.newExerciseId,
        OR: [{ ownerUserId: null }, { ownerUserId: dto.userId }],
      },
      include: {
        media: {
          where: { isActive: true },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!targetExercise) {
      throw new NotFoundError("Exercise not found");
    }

    // Backfill defensivo de snapshot para sessões legadas onde plannedExerciseId não foi preenchido
    const originalPlannedExerciseId =
      sessionExercise.plannedExerciseId ?? sessionExercise.exerciseId;
    const originalPlannedExerciseNameSnapshot =
      sessionExercise.plannedExerciseNameSnapshot ??
      sessionExercise.exerciseNameSnapshot;

    // Se estiver voltando para o exercício planejado original, reverte a substituição
    const isReverting = targetExercise.id === originalPlannedExerciseId;
    const wasSubstituted = !isReverting;
    const substitutedAt = wasSubstituted ? new Date() : null;

    const updated = await prisma.sessionExercise.update({
      where: { id: sessionExercise.id },
      data: {
        exerciseId: targetExercise.id,
        exerciseNameSnapshot: targetExercise.name,
        plannedExerciseId: originalPlannedExerciseId,
        plannedExerciseNameSnapshot: originalPlannedExerciseNameSnapshot,
        wasSubstituted,
        substitutedAt,
      },
      include: {
        exercise: {
          select: {
            id: true,
            name: true,
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
    });

    return {
      id: updated.id,
      exerciseId: updated.exerciseId,
      hasMedia: Boolean(
        updated.exercise?.media && updated.exercise.media.length > 0,
      ),
      exerciseNameSnapshot: updated.exerciseNameSnapshot,
      order: updated.order,
      plannedExerciseId: updated.plannedExerciseId,
      plannedExerciseNameSnapshot: updated.plannedExerciseNameSnapshot,
      alternative1ExerciseId: updated.alternative1ExerciseId,
      alternative1ExerciseNameSnapshot: updated.alternative1ExerciseNameSnapshot,
      alternative2ExerciseId: updated.alternative2ExerciseId,
      alternative2ExerciseNameSnapshot: updated.alternative2ExerciseNameSnapshot,
      wasSubstituted: updated.wasSubstituted,
      substitutedAt: updated.substitutedAt ? updated.substitutedAt.toISOString() : null,
      plannedWarmupSets: updated.plannedWarmupSets,
      plannedSets: updated.plannedSets,
      plannedReps: updated.plannedReps,
      plannedRestTimeInSeconds: updated.plannedRestTimeInSeconds,
      notes: updated.notes,
      sets: updated.sets.map((set) => ({
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
    };
  }
}
