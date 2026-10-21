import {
  NotFoundError,
  ValidationError,
  WorkoutSessionAlreadyCompletedError,
} from "../errors/index.js";
import { SetType } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  setId: string;
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

export class UpdateWorkoutSet {
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

    return await prisma.$transaction(async (tx) => {
      const existingSet = await tx.workoutSet.findUnique({
        where: { id: dto.setId },
        include: {
          sessionExercise: {
            select: { id: true, workoutSessionId: true },
          },
        },
      });

      if (!existingSet) {
        throw new NotFoundError("Workout set not found");
      }

      // 1. Lock Sessão
      const lockedSessions = await tx.$queryRaw<Array<{ id: string; athleteId: string; completedAt: Date | null }>>`
        SELECT id, "athleteId", "completedAt"
        FROM "WorkoutSession"
        WHERE id = ${existingSet.sessionExercise.workoutSessionId}
        FOR UPDATE
      `;

      const session = lockedSessions[0];
      if (!session || session.athleteId !== dto.userId) {
        throw new NotFoundError("Workout set not found");
      }

      if (session.completedAt !== null) {
        throw new WorkoutSessionAlreadyCompletedError("Workout session is already completed");
      }

      // 2. Lock SessionExercise
      await tx.$queryRaw`
        SELECT 1
        FROM "SessionExercise"
        WHERE id = ${existingSet.sessionExercise.id}
        FOR UPDATE
      `;

      let completedAt: Date | null | undefined = undefined;

      const willBeCompleted =
        dto.completed !== undefined ? dto.completed : existingSet.completedAt !== null;

      if (willBeCompleted) {
        const effectiveReps = dto.reps !== undefined ? dto.reps : existingSet.reps;
        const effectiveDuration =
          dto.durationInSeconds !== undefined
            ? dto.durationInSeconds
            : existingSet.durationInSeconds;

        const hasReps = effectiveReps !== null && effectiveReps !== undefined;
        const hasDuration =
          effectiveDuration !== null && effectiveDuration !== undefined;

        if (!hasReps && !hasDuration) {
          throw new ValidationError(
            "Série concluída deve possuir repetições ou duração em segundos"
          );
        }
      }

      if (dto.completed !== undefined) {
        if (dto.completed) {
          completedAt = existingSet.completedAt ?? new Date();
        } else {
          completedAt = null;
        }
      }

      const updated = await tx.workoutSet.update({
        where: { id: dto.setId },
        data: {
          type: dto.type !== undefined ? dto.type : undefined,
          weightInGrams: dto.weightInGrams !== undefined ? dto.weightInGrams : undefined,
          reps: dto.reps !== undefined ? dto.reps : undefined,
          rir: dto.rir !== undefined ? dto.rir : undefined,
          durationInSeconds:
            dto.durationInSeconds !== undefined ? dto.durationInSeconds : undefined,
          notes: dto.notes !== undefined ? dto.notes : undefined,
          completedAt: completedAt !== undefined ? completedAt : undefined,
        },
      });

      // Incrementa a revisão do SessionExercise para invalidar propostas desatualizadas
      await tx.sessionExercise.update({
        where: { id: existingSet.sessionExercise.id },
        data: { revision: { increment: 1 } },
      });

      return {
        id: updated.id,
        sessionExerciseId: updated.sessionExerciseId,
        order: updated.order,
        type: updated.type,
        weightInGrams: updated.weightInGrams,
        reps: updated.reps,
        rir: updated.rir,
        durationInSeconds: updated.durationInSeconds,
        notes: updated.notes,
        completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
        exerciseId: updated.exerciseId,
        exerciseNameSnapshot: updated.exerciseNameSnapshot,
        proposalId: updated.proposalId,
      };
    });
  }
}
