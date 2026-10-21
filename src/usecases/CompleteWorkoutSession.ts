import {
  NotFoundError,
  PendingWorkoutSetsError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  sessionId: string;
  forceComplete?: boolean;
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
      const session = await tx.workoutSession.findUnique({
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

      if (!session || session.athleteId !== dto.userId) {
        throw new NotFoundError("Workout session not found");
      }

      // Idempotência: se já estiver concluída, retorna sem alterar completedAt
      if (session.completedAt !== null) {
        return {
          id: session.id,
          workoutDayId: session.workoutDayId,
          startedAt: session.startedAt.toISOString(),
          completedAt: session.completedAt.toISOString(),
        };
      }

      // Coleta IDs de séries pendentes
      const pendingSetIds = session.sessionExercises.flatMap(
        (ex) => ex.sets.map((s) => s.id),
      );

      if (pendingSetIds.length > 0) {
        if (dto.forceComplete) {
          // Finaliza automaticamente todas as séries pendentes
          const now = new Date();
          await tx.workoutSet.updateMany({
            where: { id: { in: pendingSetIds } },
            data: { completedAt: now },
          });
        } else {
          throw new PendingWorkoutSetsError(
            `Existem ${pendingSetIds.length} série(s) pendente(s) nesta sessão. Conclua ou remova todas as séries antes de finalizar o treino.`,
          );
        }
      }

      // Servidor define completedAt (now)
      const now = new Date();
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
