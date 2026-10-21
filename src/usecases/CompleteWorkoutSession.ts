import {
  NotFoundError,
  PendingWorkoutSetsError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  sessionId: string;
}

interface OutputDto {
  id: string;
  workoutDayId: string | null;
  startedAt: string;
  completedAt: string;
}

export class CompleteWorkoutSession {
  async execute(dto: InputDto): Promise<OutputDto> {
    return prisma.$transaction(async (tx) => {
      // 1. Lock Sessão
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

      const sessionWithExercises = await tx.workoutSession.findUnique({
        where: { id: dto.sessionId },
        include: {
          sessionExercises: {
            include: {
              sets: {
                where: { completedAt: null },
                select: { id: true },
              },
            },
          },
        },
      });

      if (!sessionWithExercises) {
        throw new NotFoundError("Workout session not found");
      }

      // Idempotência: se já estiver concluída, retorna sem alterar completedAt
      if (sessionWithExercises.completedAt !== null) {
        return {
          id: sessionWithExercises.id,
          workoutDayId: sessionWithExercises.workoutDayId,
          startedAt: sessionWithExercises.startedAt.toISOString(),
          completedAt: sessionWithExercises.completedAt.toISOString(),
        };
      }

      // Verifica se existem séries pendentes criadas na sessão
      const pendingSetsCount = sessionWithExercises.sessionExercises.reduce(
        (total, ex) => total + ex.sets.length,
        0,
      );

      if (pendingSetsCount > 0) {
        throw new PendingWorkoutSetsError(
          `Existem ${pendingSetsCount} série(s) pendente(s) nesta sessão. Conclua ou remova todas as séries antes de finalizar o treino.`,
        );
      }

      // Servidor define completedAt (now)
      const now = new Date();

      // Invalida quaisquer propostas pendentes da sessão concluída
      await tx.workoutSetProposal.updateMany({
        where: {
          workoutSessionId: sessionWithExercises.id,
          status: "PENDING",
        },
        data: {
          status: "INVALIDATED",
          invalidationReason: "SESSION_COMPLETED",
        },
      });

      const updated = await tx.workoutSession.update({
        where: { id: dto.sessionId },
        data: {
          completedAt: now,
        },
      });

      return {
        id: updated.id,
        workoutDayId: updated.workoutDayId,
        startedAt: updated.startedAt.toISOString(),
        completedAt: updated.completedAt
          ? updated.completedAt.toISOString()
          : now.toISOString(),
      };
    });
  }
}
