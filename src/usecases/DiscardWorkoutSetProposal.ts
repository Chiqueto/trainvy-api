import {
  NotFoundError,
  ProposalAlreadyProcessedError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";
import { ProposedSetInput } from "../schemas/index.js";
import { WorkoutSetProposalOutputDto } from "./ProposeSessionSets.js";

interface InputDto {
  userId: string;
  sessionId: string;
  proposalId: string;
  reason?: string;
}

export interface DiscardWorkoutSetProposalOutputDto {
  success: boolean;
  proposal: WorkoutSetProposalOutputDto;
}

export class DiscardWorkoutSetProposal {
  async execute(dto: InputDto): Promise<DiscardWorkoutSetProposalOutputDto> {
    return await prisma.$transaction(async (tx) => {
      // 1. Lock Sessão
      const lockedSessions = await tx.$queryRaw<Array<{ id: string; athleteId: string }>>`
        SELECT id, "athleteId"
        FROM "WorkoutSession"
        WHERE id = ${dto.sessionId}
        FOR UPDATE
      `;

      const session = lockedSessions[0];
      if (!session || session.athleteId !== dto.userId) {
        throw new NotFoundError("Workout session not found");
      }

      // 2. Lock Proposta
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

      // Se já descartada: idempotente
      if (proposal.status === "DISCARDED") {
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
            status: "DISCARDED" as const,
            invalidationReason: proposal.invalidationReason,
            suggestedSets: proposal.suggestedSets as unknown as ProposedSetInput[],
            confirmedSets: proposal.confirmedSets as unknown as ProposedSetInput[] | null,
            idempotencyKey: proposal.idempotencyKey,
            expiresAt: proposal.expiresAt.toISOString(),
            confirmedAt: proposal.confirmedAt ? proposal.confirmedAt.toISOString() : null,
            discardedAt: proposal.discardedAt ? proposal.discardedAt.toISOString() : null,
            createdAt: proposal.createdAt.toISOString(),
            updatedAt: proposal.updatedAt.toISOString(),
          },
        };
      }

      // Se já confirmada: erro de conflito
      if (proposal.status === "CONFIRMED") {
        throw new ProposalAlreadyProcessedError(
          "Não é possível descartar uma proposta que já foi confirmada.",
          "PROPOSAL_ALREADY_CONFIRMED",
        );
      }

      const now = new Date();
      const updated = await tx.workoutSetProposal.update({
        where: { id: proposal.id },
        data: {
          status: "DISCARDED",
          discardedAt: now,
          invalidationReason: dto.reason ?? "DISCARDED_BY_USER",
        },
      });

      return {
        success: true,
        proposal: {
          id: updated.id,
          userId: updated.userId,
          workoutSessionId: updated.workoutSessionId,
          sessionExerciseId: updated.sessionExerciseId,
          targetExerciseId: updated.targetExerciseId,
          targetExerciseNameSnapshot: updated.targetExerciseNameSnapshot,
          targetSessionExerciseRevision: updated.targetSessionExerciseRevision,
          status: updated.status,
          invalidationReason: updated.invalidationReason,
          suggestedSets: updated.suggestedSets as unknown as ProposedSetInput[],
          confirmedSets: updated.confirmedSets as unknown as ProposedSetInput[] | null,
          idempotencyKey: updated.idempotencyKey,
          expiresAt: updated.expiresAt.toISOString(),
          confirmedAt: updated.confirmedAt ? updated.confirmedAt.toISOString() : null,
          discardedAt: updated.discardedAt ? updated.discardedAt.toISOString() : null,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      };
    });
  }
}
