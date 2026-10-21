import {
  NotFoundError,
  ValidationError,
  WorkoutSessionAlreadyCompletedError,
} from "../errors/index.js";
import { WorkoutSetProposalStatus } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";
import { ProposedSetInput } from "../schemas/index.js";

interface InputDto {
  userId: string;
  sessionId: string;
  sessionExerciseId: string;
  sets: ProposedSetInput[];
  idempotencyKey?: string;
}

export interface WorkoutSetProposalOutputDto {
  id: string;
  userId: string;
  workoutSessionId: string;
  sessionExerciseId: string;
  targetExerciseId: string | null;
  targetExerciseNameSnapshot: string;
  targetSessionExerciseRevision: number;
  status: WorkoutSetProposalStatus;
  invalidationReason: string | null;
  suggestedSets: ProposedSetInput[];
  confirmedSets: ProposedSetInput[] | null;
  idempotencyKey: string | null;
  expiresAt: string;
  confirmedAt: string | null;
  discardedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class ProposeSessionSets {
  async execute(dto: InputDto): Promise<WorkoutSetProposalOutputDto> {
    if (!dto.sets || dto.sets.length === 0) {
      throw new ValidationError("A proposta de séries deve conter ao menos uma série");
    }

    if (dto.sets.length > 20) {
      throw new ValidationError("Número de séries excede o limite permitido (máximo 20)");
    }

    // Validação dos valores de cada série
    for (const [index, set] of dto.sets.entries()) {
      if (set.weightKg !== undefined && set.weightKg !== null) {
        if (typeof set.weightKg !== "number" || set.weightKg < 0 || set.weightKg > 1000) {
          throw new ValidationError(
            `Série ${index + 1}: carga deve estar entre 0 kg e 1000 kg`,
          );
        }
      }
      if (set.reps !== undefined && set.reps !== null) {
        if (!Number.isInteger(set.reps) || set.reps < 0 || set.reps > 500) {
          throw new ValidationError(
            `Série ${index + 1}: repetições devem ser um número inteiro entre 0 e 500`,
          );
        }
      }
      if (set.rir !== undefined && set.rir !== null) {
        if (!Number.isInteger(set.rir) || set.rir < 0 || set.rir > 10) {
          throw new ValidationError(
            `Série ${index + 1}: RIR deve ser um número inteiro entre 0 e 10`,
          );
        }
      }
      if (set.durationInSeconds !== undefined && set.durationInSeconds !== null) {
        if (!Number.isInteger(set.durationInSeconds) || set.durationInSeconds < 0 || set.durationInSeconds > 86400) {
          throw new ValidationError(
            `Série ${index + 1}: duração deve ser um número inteiro entre 0 e 86400 segundos`,
          );
        }
      }
    }

    const session = await prisma.workoutSession.findUnique({
      where: { id: dto.sessionId },
    });

    if (!session || session.athleteId !== dto.userId) {
      throw new NotFoundError("Workout session not found");
    }

    if (session.completedAt !== null) {
      throw new WorkoutSessionAlreadyCompletedError("Workout session is already completed");
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

    // Se houver idempotencyKey, verifica se já existe proposta criada
    if (dto.idempotencyKey) {
      const existing = await prisma.workoutSetProposal.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        return {
          id: existing.id,
          userId: existing.userId,
          workoutSessionId: existing.workoutSessionId,
          sessionExerciseId: existing.sessionExerciseId,
          targetExerciseId: existing.targetExerciseId,
          targetExerciseNameSnapshot: existing.targetExerciseNameSnapshot,
          targetSessionExerciseRevision: existing.targetSessionExerciseRevision,
          status: existing.status,
          invalidationReason: existing.invalidationReason,
          suggestedSets: existing.suggestedSets as unknown as ProposedSetInput[],
          confirmedSets: existing.confirmedSets as unknown as ProposedSetInput[] | null,
          idempotencyKey: existing.idempotencyKey,
          expiresAt: existing.expiresAt.toISOString(),
          confirmedAt: existing.confirmedAt ? existing.confirmedAt.toISOString() : null,
          discardedAt: existing.discardedAt ? existing.discardedAt.toISOString() : null,
          createdAt: existing.createdAt.toISOString(),
          updatedAt: existing.updatedAt.toISOString(),
        };
      }
    }

    // Expira em 30 minutos a partir da criação
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const proposal = await prisma.workoutSetProposal.create({
      data: {
        userId: dto.userId,
        workoutSessionId: session.id,
        sessionExerciseId: sessionExercise.id,
        targetExerciseId: sessionExercise.exerciseId,
        targetExerciseNameSnapshot: sessionExercise.exerciseNameSnapshot,
        targetSessionExerciseRevision: sessionExercise.revision,
        status: "PENDING",
        suggestedSets: dto.sets as any,
        idempotencyKey: dto.idempotencyKey ?? null,
        expiresAt,
      },
    });

    return {
      id: proposal.id,
      userId: proposal.userId,
      workoutSessionId: proposal.workoutSessionId,
      sessionExerciseId: proposal.sessionExerciseId,
      targetExerciseId: proposal.targetExerciseId,
      targetExerciseNameSnapshot: proposal.targetExerciseNameSnapshot,
      targetSessionExerciseRevision: proposal.targetSessionExerciseRevision,
      status: proposal.status,
      invalidationReason: proposal.invalidationReason,
      suggestedSets: proposal.suggestedSets as unknown as ProposedSetInput[],
      confirmedSets: proposal.confirmedSets as unknown as ProposedSetInput[] | null,
      idempotencyKey: proposal.idempotencyKey,
      expiresAt: proposal.expiresAt.toISOString(),
      confirmedAt: proposal.confirmedAt ? proposal.confirmedAt.toISOString() : null,
      discardedAt: proposal.discardedAt ? proposal.discardedAt.toISOString() : null,
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
    };
  }
}
