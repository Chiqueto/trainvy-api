import {
  NotFoundError,
  ValidationError,
  WorkoutSessionAlreadyCompletedError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  sessionExerciseId: string;
}

interface OutputDto {
  success: boolean;
}

export class RemoveExerciseFromWorkoutSession {
  async execute(dto: InputDto): Promise<OutputDto> {
    return await prisma.$transaction(async (tx) => {
      const targetSE = await tx.sessionExercise.findUnique({
        where: { id: dto.sessionExerciseId },
        select: { id: true, workoutSessionId: true },
      });

      if (!targetSE) {
        throw new NotFoundError("Session exercise not found");
      }

      // 1. Lock Sessão
      const lockedSessions = await tx.$queryRaw<Array<{ id: string; athleteId: string; completedAt: Date | null; workoutDayId: string | null }>>`
        SELECT id, "athleteId", "completedAt", "workoutDayId"
        FROM "WorkoutSession"
        WHERE id = ${targetSE.workoutSessionId}
        FOR UPDATE
      `;

      const session = lockedSessions[0];
      if (!session || session.athleteId !== dto.userId) {
        throw new NotFoundError("Session exercise not found");
      }

      if (session.completedAt !== null) {
        throw new WorkoutSessionAlreadyCompletedError(
          "Workout session is already completed",
        );
      }

      if (session.workoutDayId !== null) {
        throw new ValidationError(
          "Cannot remove exercise from a planned workout session",
        );
      }

      // 2. Lock SessionExercise
      await tx.$queryRaw`
        SELECT 1
        FROM "SessionExercise"
        WHERE id = ${dto.sessionExerciseId}
        FOR UPDATE
      `;

      // Invalida propostas pendentes deste exercício
      await tx.workoutSetProposal.updateMany({
        where: {
          sessionExerciseId: dto.sessionExerciseId,
          status: "PENDING",
        },
        data: {
          status: "INVALIDATED",
          invalidationReason: "EXERCISE_REMOVED",
        },
      });

      await tx.sessionExercise.delete({
        where: { id: dto.sessionExerciseId },
      });

      return { success: true };
    });
  }
}
