import { ConflictError, NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  sessionId: string;
}

interface OutputDto {
  success: boolean;
  sessionId: string;
}

export class CancelWorkoutSession {
  async execute(dto: InputDto): Promise<OutputDto> {
    return await prisma.$transaction(async (tx) => {
      const lockedSessions = await tx.$queryRaw<Array<{ id: string; athleteId: string; completedAt: Date | null }>>`
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
        throw new ConflictError("Cannot cancel an already completed workout session");
      }

      // Exclui a sessão e seus registros em cascata
      await tx.workoutSession.delete({
        where: { id: dto.sessionId },
      });

      return {
        success: true,
        sessionId: dto.sessionId,
      };
    });
  }
}
