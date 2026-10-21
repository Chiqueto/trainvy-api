import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import { ProposedSetInput } from "../schemas/index.js";
import { WorkoutSetProposalOutputDto } from "./ProposeSessionSets.js";

interface InputDto {
  userId: string;
  sessionId: string;
}

export class ListWorkoutSetProposals {
  async execute(dto: InputDto): Promise<{ proposals: WorkoutSetProposalOutputDto[] }> {
    const session = await prisma.workoutSession.findUnique({
      where: { id: dto.sessionId },
      select: { id: true, athleteId: true },
    });

    if (!session || session.athleteId !== dto.userId) {
      throw new NotFoundError("Workout session not found");
    }

    const proposals = await prisma.workoutSetProposal.findMany({
      where: {
        workoutSessionId: dto.sessionId,
        userId: dto.userId,
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      proposals: proposals.map((p) => ({
        id: p.id,
        userId: p.userId,
        workoutSessionId: p.workoutSessionId,
        sessionExerciseId: p.sessionExerciseId,
        targetExerciseId: p.targetExerciseId,
        targetExerciseNameSnapshot: p.targetExerciseNameSnapshot,
        targetSessionExerciseRevision: p.targetSessionExerciseRevision,
        status: p.status,
        invalidationReason: p.invalidationReason,
        suggestedSets: p.suggestedSets as unknown as ProposedSetInput[],
        confirmedSets: p.confirmedSets as unknown as ProposedSetInput[] | null,
        idempotencyKey: p.idempotencyKey,
        expiresAt: p.expiresAt.toISOString(),
        confirmedAt: p.confirmedAt ? p.confirmedAt.toISOString() : null,
        discardedAt: p.discardedAt ? p.discardedAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    };
  }
}
