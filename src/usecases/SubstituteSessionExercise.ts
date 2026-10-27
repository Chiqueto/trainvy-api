import { plannedAdvancedPrescription } from "../schemas/advanced-prescription.js";
import {
  NotFoundError,
  WorkoutSessionAlreadyCompletedError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";
import { SessionExerciseOutputDto } from "./GetWorkoutSession.js";

interface InputDto {
  userId: string;
  sessionId: string;
  sessionExerciseId: string;
  newExerciseId: string;
}

export class SubstituteSessionExercise {
  async execute(dto: InputDto): Promise<SessionExerciseOutputDto> {
    return await prisma.$transaction(async (tx) => {
      // 1. Lock Sessão
      const lockedSessions = await tx.$queryRaw<
        Array<{ id: string; athleteId: string; completedAt: Date | null }>
      >`
        SELECT id, "athleteId", "completedAt"
        FROM "WorkoutSession"
        WHERE id = ${dto.sessionId}
        FOR UPDATE
      `;

      const session = lockedSessions[0];
      if (!session || session.athleteId !== dto.userId) {
        throw new NotFoundError("Workout session not found");
      }

      if (session.completedAt !== null) {
        throw new WorkoutSessionAlreadyCompletedError(
          "Workout session is already completed",
        );
      }

      // 2. Lock SessionExercise
      const lockedExercises = await tx.$queryRaw<
        Array<{
          id: string;
          exerciseId: string | null;
          exerciseNameSnapshot: string;
          plannedExerciseId: string | null;
          plannedExerciseNameSnapshot: string | null;
          revision: number;
        }>
      >`
        SELECT id, "exerciseId", "exerciseNameSnapshot", "plannedExerciseId", "plannedExerciseNameSnapshot", revision
        FROM "SessionExercise"
        WHERE id = ${dto.sessionExerciseId} AND "workoutSessionId" = ${session.id}
        FOR UPDATE
      `;

      const sessionExercise = lockedExercises[0];
      if (!sessionExercise) {
        throw new NotFoundError("Session exercise not found");
      }

      const targetExercise = await tx.exercise.findFirst({
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

      // Backfill defensivo: qualquer série já registrada neste SessionExercise que ainda não possua exerciseId
      // é atribuída explicitamente ao exercício anterior antes de realizarmos a substituição!
      if (sessionExercise.exerciseId) {
        await tx.workoutSet.updateMany({
          where: {
            sessionExerciseId: sessionExercise.id,
            exerciseId: null,
          },
          data: {
            exerciseId: sessionExercise.exerciseId,
            exerciseNameSnapshot: sessionExercise.exerciseNameSnapshot,
          },
        });
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

      const updated = await tx.sessionExercise.update({
        where: { id: sessionExercise.id },
        data: {
          exerciseId: targetExercise.id,
          exerciseNameSnapshot: targetExercise.name,
          plannedExerciseId: originalPlannedExerciseId,
          plannedExerciseNameSnapshot: originalPlannedExerciseNameSnapshot,
          wasSubstituted,
          substitutedAt,
          revision: { increment: 1 },
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
        alternative1ExerciseNameSnapshot:
          updated.alternative1ExerciseNameSnapshot,
        alternative2ExerciseId: updated.alternative2ExerciseId,
        alternative2ExerciseNameSnapshot:
          updated.alternative2ExerciseNameSnapshot,
        wasSubstituted: updated.wasSubstituted,
        substitutedAt: updated.substitutedAt
          ? updated.substitutedAt.toISOString()
          : null,
        plannedWarmupSets: updated.plannedWarmupSets,
        plannedSets: updated.plannedSets,
        plannedReps: updated.plannedReps,
        ...plannedAdvancedPrescription(updated),
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
    });
  }
}
