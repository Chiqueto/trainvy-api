import {
  IdempotencyConflictError,
  NotFoundError,
  ProposalAlreadyProcessedError,
  ProposalExpiredError,
  ProposalOutdatedError,
  ValidationError,
} from "../errors/index.js";
import { SetType } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";
import { ProposedSetInput } from "../schemas/index.js";
import { WorkoutSetProposalOutputDto } from "./ProposeSessionSets.js";

interface InputDto {
  userId: string;
  sessionId: string;
  proposalId: string;
  sets: ProposedSetInput[];
  idempotencyKey?: string;
}

export interface CreatedSetOutputDto {
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

export interface ConfirmWorkoutSetProposalOutputDto {
  success: boolean;
  proposal: WorkoutSetProposalOutputDto;
  createdSets: CreatedSetOutputDto[];
}

export class ConfirmWorkoutSetProposal {
  async execute(dto: InputDto): Promise<ConfirmWorkoutSetProposalOutputDto> {
    if (!dto.sets || dto.sets.length === 0) {
      throw new ValidationError("A proposta deve conter ao menos uma série");
    }

    if (dto.sets.length > 20) {
      throw new ValidationError("Número de séries excede o limite permitido (máximo 20)");
    }

    // Validação estrita de cada série editada pelo atleta
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

    // Protocolo de concorrência com lock ordenado:
    // 1. WorkoutSession -> 2. SessionExercise -> 3. WorkoutSetProposal
    const result = await prisma.$transaction(async (tx) => {
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

      // 3. Lock Proposta (para conhecer o sessionExerciseId correspondente)
      const lockedProposals = await tx.$queryRaw<Array<{
        id: string;
        userId: string;
        workoutSessionId: string;
        sessionExerciseId: string;
        targetExerciseId: string | null;
        targetExerciseNameSnapshot: string;
        targetSessionExerciseRevision: number;
        status: string;
        invalidationReason: string | null;
        suggestedSets: any;
        confirmedSets: any;
        idempotencyKey: string | null;
        expiresAt: Date;
        confirmedAt: Date | null;
        discardedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }>>`
        SELECT *
        FROM "WorkoutSetProposal"
        WHERE id = ${dto.proposalId}
        FOR UPDATE
      `;

      const proposal = lockedProposals[0];
      if (!proposal || proposal.userId !== dto.userId || proposal.workoutSessionId !== session.id) {
        throw new NotFoundError("Workout set proposal not found");
      }

      // 2. Lock SessionExercise
      const lockedExercises = await tx.$queryRaw<Array<{
        id: string;
        workoutSessionId: string;
        exerciseId: string | null;
        exerciseNameSnapshot: string;
        revision: number;
      }>>`
        SELECT id, "workoutSessionId", "exerciseId", "exerciseNameSnapshot", revision
        FROM "SessionExercise"
        WHERE id = ${proposal.sessionExerciseId} AND "workoutSessionId" = ${session.id}
        FOR UPDATE
      `;

      const sessionExercise = lockedExercises[0];
      if (!sessionExercise) {
        // Se o exercício foi excluído da sessão: invalida proposta e persiste
        await tx.workoutSetProposal.update({
          where: { id: proposal.id },
          data: { status: "INVALIDATED", invalidationReason: "EXERCISE_REMOVED" },
        });
        return {
          mustThrow: true,
          error: new ProposalOutdatedError(
            "O exercício foi removido da sessão. A proposta foi invalidada.",
            "EXERCISE_REMOVED",
          ),
        };
      }

      // Verificação de idempotência: Se já CONFIRMADA
      if (proposal.status === "CONFIRMED") {
        // Compara payload de séries ou idempotencyKey
        const existingSetsJson = JSON.stringify(proposal.confirmedSets);
        const incomingSetsJson = JSON.stringify(dto.sets);

        const isSameIdempotencyKey = Boolean(
          dto.idempotencyKey && dto.idempotencyKey === proposal.idempotencyKey,
        );

        if (isSameIdempotencyKey || existingSetsJson === incomingSetsJson) {
          // Retorna idempotentemente as séries já criadas vinculadas a esta proposta
          const existingSets = await tx.workoutSet.findMany({
            where: { proposalId: proposal.id },
            orderBy: { order: "asc" },
          });

          return {
            success: true,
            proposal: {
              id: proposal.id,
              userId: proposal.userId,
              workoutSessionId: proposal.workoutSessionId,
              sessionExerciseId: proposal.sessionExerciseId,
              targetExerciseId: proposal.targetExerciseId,
              targetExerciseNameSnapshot: proposal.targetExerciseNameSnapshot,
              targetSessionExerciseRevision: proposal.targetSessionExerciseRevision,
              status: "CONFIRMED" as const,
              invalidationReason: proposal.invalidationReason,
              suggestedSets: proposal.suggestedSets,
              confirmedSets: proposal.confirmedSets,
              idempotencyKey: proposal.idempotencyKey,
              expiresAt: proposal.expiresAt.toISOString(),
              confirmedAt: proposal.confirmedAt ? proposal.confirmedAt.toISOString() : null,
              discardedAt: proposal.discardedAt ? proposal.discardedAt.toISOString() : null,
              createdAt: proposal.createdAt.toISOString(),
              updatedAt: proposal.updatedAt.toISOString(),
            },
            createdSets: existingSets.map((s) => ({
              id: s.id,
              sessionExerciseId: s.sessionExerciseId,
              order: s.order,
              type: s.type,
              weightInGrams: s.weightInGrams,
              reps: s.reps,
              rir: s.rir,
              durationInSeconds: s.durationInSeconds,
              notes: s.notes,
              completedAt: s.completedAt ? s.completedAt.toISOString() : null,
              exerciseId: s.exerciseId,
              exerciseNameSnapshot: s.exerciseNameSnapshot,
              proposalId: s.proposalId,
            })),
          };
        }

        // Payload divergente para proposta já confirmada: erro de conflito
        throw new IdempotencyConflictError(
          "A proposta já foi confirmada com um conjunto diferente de séries.",
        );
      }

      // Se já DESCARTADA
      if (proposal.status === "DISCARDED") {
        throw new ProposalAlreadyProcessedError(
          "A proposta foi descartada e não pode ser confirmada.",
          "PROPOSAL_ALREADY_DISCARDED",
        );
      }

      // Se já INVALIDADA
      if (proposal.status === "INVALIDATED") {
        throw new ProposalOutdatedError(
          "A proposta está invalidada.",
          proposal.invalidationReason ?? "PROPOSAL_INVALIDATED",
        );
      }

      const now = new Date();

      // Checa Expiração: TTL 30 minutos
      if (new Date(proposal.expiresAt) < now) {
        await tx.workoutSetProposal.update({
          where: { id: proposal.id },
          data: { status: "INVALIDATED", invalidationReason: "EXPIRED" },
        });
        return {
          mustThrow: true,
          error: new ProposalExpiredError("A proposta expirou."),
        };
      }

      // Checa Sessão Finalizada
      if (session.completedAt !== null) {
        await tx.workoutSetProposal.update({
          where: { id: proposal.id },
          data: { status: "INVALIDATED", invalidationReason: "SESSION_COMPLETED" },
        });
        return {
          mustThrow: true,
          error: new ProposalOutdatedError(
            "A sessão de treino já foi concluída.",
            "SESSION_COMPLETED",
          ),
        };
      }

      // Checa Substituição de Exercício ou Revisão Divergente (incluindo swap A -> B -> A)
      const isExerciseMismatch = sessionExercise.exerciseId !== proposal.targetExerciseId;
      const isRevisionMismatch = sessionExercise.revision !== proposal.targetSessionExerciseRevision;

      if (isExerciseMismatch || isRevisionMismatch) {
        const reason = isExerciseMismatch ? "EXERCISE_SUBSTITUTED" : "CONTEXT_REVISION_MISMATCH";
        await tx.workoutSetProposal.update({
          where: { id: proposal.id },
          data: { status: "INVALIDATED", invalidationReason: reason },
        });
        return {
          mustThrow: true,
          error: new ProposalOutdatedError(
            "O exercício ou contexto de treino foi alterado desde a geração da proposta. Por favor, solicite nova revisão à IA.",
            reason,
          ),
        };
      }

      // Calcula próximo número de ordem sob lock exclusivo do SessionExercise
      const maxOrderRow = await tx.$queryRaw<Array<{ max_order: number | null }>>`
        SELECT MAX("order") as max_order
        FROM "WorkoutSet"
        WHERE "sessionExerciseId" = ${sessionExercise.id}
      `;

      let currentOrder = (maxOrderRow[0]?.max_order ? Number(maxOrderRow[0].max_order) : 0) + 1;

      // Cria lote de WorkoutSets atomicamente vinculados à proposta e ao exercício executado
      const createdSets: CreatedSetOutputDto[] = [];

      for (const set of dto.sets) {
        const weightInGrams =
          set.weightKg !== undefined && set.weightKg !== null
            ? Math.round(set.weightKg * 1000)
            : null;

        const newSet = await tx.workoutSet.create({
          data: {
            id: crypto.randomUUID(),
            sessionExerciseId: sessionExercise.id,
            exerciseId: sessionExercise.exerciseId,
            exerciseNameSnapshot: sessionExercise.exerciseNameSnapshot,
            proposalId: proposal.id,
            order: currentOrder++,
            type: set.type ?? "WORKING",
            weightInGrams,
            reps: set.reps ?? null,
            rir: set.rir ?? null,
            durationInSeconds: set.durationInSeconds ?? null,
            notes: set.notes ?? null,
            completedAt: now,
          },
        });

        createdSets.push({
          id: newSet.id,
          sessionExerciseId: newSet.sessionExerciseId,
          order: newSet.order,
          type: newSet.type,
          weightInGrams: newSet.weightInGrams,
          reps: newSet.reps,
          rir: newSet.rir,
          durationInSeconds: newSet.durationInSeconds,
          notes: newSet.notes,
          completedAt: newSet.completedAt ? newSet.completedAt.toISOString() : null,
          exerciseId: newSet.exerciseId,
          exerciseNameSnapshot: newSet.exerciseNameSnapshot,
          proposalId: newSet.proposalId,
        });
      }

      // Atualiza proposta para CONFIRMED e persiste sets efetivamente confirmados
      const updatedProposal = await tx.workoutSetProposal.update({
        where: { id: proposal.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: now,
          confirmedSets: dto.sets as any,
          idempotencyKey: dto.idempotencyKey ?? proposal.idempotencyKey,
        },
      });

      // Incrementa a revisão do SessionExercise
      await tx.sessionExercise.update({
        where: { id: sessionExercise.id },
        data: { revision: { increment: 1 } },
      });

      return {
        success: true,
        proposal: {
          id: updatedProposal.id,
          userId: updatedProposal.userId,
          workoutSessionId: updatedProposal.workoutSessionId,
          sessionExerciseId: updatedProposal.sessionExerciseId,
          targetExerciseId: updatedProposal.targetExerciseId,
          targetExerciseNameSnapshot: updatedProposal.targetExerciseNameSnapshot,
          targetSessionExerciseRevision: updatedProposal.targetSessionExerciseRevision,
          status: updatedProposal.status,
          invalidationReason: updatedProposal.invalidationReason,
          suggestedSets: updatedProposal.suggestedSets as unknown as ProposedSetInput[],
          confirmedSets: updatedProposal.confirmedSets as unknown as ProposedSetInput[] | null,
          idempotencyKey: updatedProposal.idempotencyKey,
          expiresAt: updatedProposal.expiresAt.toISOString(),
          confirmedAt: updatedProposal.confirmedAt ? updatedProposal.confirmedAt.toISOString() : null,
          discardedAt: updatedProposal.discardedAt ? updatedProposal.discardedAt.toISOString() : null,
          createdAt: updatedProposal.createdAt.toISOString(),
          updatedAt: updatedProposal.updatedAt.toISOString(),
        },
        createdSets,
      };
    });

    if ("mustThrow" in result && (result as any).mustThrow) {
      throw (result as any).error;
    }

    return result as ConfirmWorkoutSetProposalOutputDto;
  }
}
