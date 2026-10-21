import {
  NotFoundError,
  WorkoutSessionAlreadyCompletedError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  setId: string;
}

interface OutputDto {
  success: boolean;
}

export class DeleteWorkoutSet {
  async execute(dto: InputDto): Promise<OutputDto> {
    return await prisma.$transaction(async (tx) => {
      const set = await tx.workoutSet.findUnique({
        where: { id: dto.setId },
        include: {
          sessionExercise: {
            select: { id: true, workoutSessionId: true },
          },
        },
      });

      if (!set) {
        throw new NotFoundError("Workout set not found");
      }

      // 1. Lock Sessão
      const lockedSessions = await tx.$queryRaw<Array<{ id: string; athleteId: string; completedAt: Date | null }>>`
        SELECT id, "athleteId", "completedAt"
        FROM "WorkoutSession"
        WHERE id = ${set.sessionExercise.workoutSessionId}
        FOR UPDATE
      `;

      const session = lockedSessions[0];
      if (!session || session.athleteId !== dto.userId) {
        throw new NotFoundError("Workout set not found");
      }

      if (session.completedAt !== null) {
        throw new WorkoutSessionAlreadyCompletedError(
          "Workout session is already completed"
        );
      }

      // 2. Lock SessionExercise
      await tx.$queryRaw`
        SELECT 1
        FROM "SessionExercise"
        WHERE id = ${set.sessionExercise.id}
        FOR UPDATE
      `;

      await tx.workoutSet.delete({
        where: { id: dto.setId },
      });

      // Incrementa a revisão do SessionExercise para invalidar propostas desatualizadas
      await tx.sessionExercise.update({
        where: { id: set.sessionExercise.id },
        data: { revision: { increment: 1 } },
      });

      return { success: true };
    });
  }
}
