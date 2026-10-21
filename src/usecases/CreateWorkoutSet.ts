import {
  NotFoundError,
  ValidationError,
  WorkoutSessionAlreadyCompletedError,
} from "../errors/index.js";
import { SetType } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  sessionExerciseId: string;
  type?: SetType;
  weightInGrams?: number | null;
  reps?: number | null;
  rir?: number | null;
  durationInSeconds?: number | null;
  notes?: string | null;
  completed?: boolean;
}

interface OutputDto {
  id: string;
  sessionExerciseId: string;
  order: number;
  type: SetType;
  weightInGrams: number | null;
  reps: number | null;
  rir: number | null;
  durationInSeconds: number | null;
  notes: string | null;
  completedAt: string | null;
  exerciseId?: string | null;
  exerciseNameSnapshot?: string | null;
  proposalId?: string | null;
}

export class CreateWorkoutSet {
  async execute(dto: InputDto): Promise<OutputDto> {
    if (dto.weightInGrams !== undefined && dto.weightInGrams !== null) {
      if (!Number.isInteger(dto.weightInGrams) || dto.weightInGrams < 0) {
        throw new ValidationError("O peso deve ser um número inteiro maior ou igual a zero");
      }
    }

    if (dto.reps !== undefined && dto.reps !== null) {
      if (!Number.isInteger(dto.reps) || dto.reps < 0) {
        throw new ValidationError("O número de repetições deve ser um número inteiro maior ou igual a zero");
      }
    }

    if (dto.rir !== undefined && dto.rir !== null) {
      if (!Number.isInteger(dto.rir) || dto.rir < 0 || dto.rir > 10) {
        throw new ValidationError("O RIR deve ser um número inteiro entre 0 e 10");
      }
    }

    if (dto.durationInSeconds !== undefined && dto.durationInSeconds !== null) {
      if (!Number.isInteger(dto.durationInSeconds) || dto.durationInSeconds < 0) {
        throw new ValidationError("A duração deve ser um número inteiro maior ou igual a zero");
      }
    }

    if (dto.completed) {
      const hasReps = dto.reps !== null && dto.reps !== undefined;
      const hasDuration = dto.durationInSeconds !== null && dto.durationInSeconds !== undefined;

      if (!hasReps && !hasDuration) {
        throw new ValidationError("Série concluída deve possuir repetições ou duração em segundos");
      }
    }

    return await prisma.$transaction(async (tx) => {
      // Busca sessionExercise preliminar para obter workoutSessionId
      const targetSE = await tx.sessionExercise.findUnique({
        where: { id: dto.sessionExerciseId },
        select: { id: true, workoutSessionId: true },
      });

      if (!targetSE) {
        throw new NotFoundError("Session exercise not found");
      }

      // 1. Lock Sessão
      const lockedSessions = await tx.$queryRaw<Array<{ id: string; athleteId: string; completedAt: Date | null }>>`
        SELECT id, "athleteId", "completedAt"
        FROM "WorkoutSession"
        WHERE id = ${targetSE.workoutSessionId}
        FOR UPDATE
      `;

      const session = lockedSessions[0];
      if (!session || session.athleteId !== dto.userId) {
        throw new NotFoundError("Session exercise not found");
      }

      if (session.completedAt !== null) {
        throw new WorkoutSessionAlreadyCompletedError("Workout session is already completed");
      }

      // 2. Lock SessionExercise
      const lockedExercises = await tx.$queryRaw<Array<{
        id: string;
        exerciseId: string | null;
        exerciseNameSnapshot: string;
        revision: number;
      }>>`
        SELECT id, "exerciseId", "exerciseNameSnapshot", revision
        FROM "SessionExercise"
        WHERE id = ${dto.sessionExerciseId}
        FOR UPDATE
      `;

      const sessionExercise = lockedExercises[0];
      if (!sessionExercise) {
        throw new NotFoundError("Session exercise not found");
      }

      // Calcula nextOrder sob lock
      const maxOrderRow = await tx.$queryRaw<Array<{ max_order: number | null }>>`
        SELECT MAX("order") as max_order
        FROM "WorkoutSet"
        WHERE "sessionExerciseId" = ${sessionExercise.id}
      `;

      const nextOrder = (maxOrderRow[0]?.max_order ? Number(maxOrderRow[0].max_order) : 0) + 1;
      const completedAt = dto.completed ? new Date() : null;

      const set = await tx.workoutSet.create({
        data: {
          id: crypto.randomUUID(),
          sessionExerciseId: sessionExercise.id,
          exerciseId: sessionExercise.exerciseId,
          exerciseNameSnapshot: sessionExercise.exerciseNameSnapshot,
          order: nextOrder,
          type: dto.type ?? "WORKING",
          weightInGrams: dto.weightInGrams ?? null,
          reps: dto.reps ?? null,
          rir: dto.rir ?? null,
          durationInSeconds: dto.durationInSeconds ?? null,
          notes: dto.notes ?? null,
          completedAt,
        },
      });

      // Incrementa a revisão do SessionExercise para invalidar propostas desatualizadas
      await tx.sessionExercise.update({
        where: { id: sessionExercise.id },
        data: { revision: { increment: 1 } },
      });

      return {
        id: set.id,
        sessionExerciseId: set.sessionExerciseId,
        order: set.order,
        type: set.type,
        weightInGrams: set.weightInGrams,
        reps: set.reps,
        rir: set.rir,
        durationInSeconds: set.durationInSeconds,
        notes: set.notes,
        completedAt: set.completedAt ? set.completedAt.toISOString() : null,
        exerciseId: set.exerciseId,
        exerciseNameSnapshot: set.exerciseNameSnapshot,
        proposalId: set.proposalId,
      };
    });
  }
}
