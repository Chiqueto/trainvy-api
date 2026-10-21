import { prisma } from "../lib/db.js";
import type { ForgottenWorkoutDraftDto } from "../schemas/index.js";

interface ListActiveForgottenWorkoutDraftsInput {
  userId: string;
  conversationId?: string;
}

export class ListActiveForgottenWorkoutDrafts {
  async execute(input: ListActiveForgottenWorkoutDraftsInput): Promise<{ drafts: ForgottenWorkoutDraftDto[] }> {
    const { userId, conversationId } = input;

    const where: any = {
      userId,
      status: "DRAFT",
      expiresAt: { gt: new Date() },
    };

    if (conversationId) {
      where.conversationId = conversationId;
    }

    const drafts = await prisma.forgottenWorkoutDraft.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return {
      drafts: drafts.map((draft) => ({
        id: draft.id,
        userId: draft.userId,
        conversationId: draft.conversationId,
        revision: draft.revision,
        status: draft.status,
        sessionDate: draft.sessionDate.toISOString().split("T")[0],
        timePrecision: draft.timePrecision,
        startedAt: draft.startedAt ? draft.startedAt.toISOString() : null,
        completedAt: draft.completedAt ? draft.completedAt.toISOString() : null,
        timezone: draft.timezone,
        workoutPlanId: draft.workoutPlanId,
        workoutDayId: draft.workoutDayId,
        title: draft.title,
        origin: draft.origin,
        proposedExercises: draft.proposedExercises as any,
        confirmedSessionId: null,
        idempotencyKey: draft.idempotencyKey,
        expiresAt: draft.expiresAt.toISOString(),
        confirmedAt: null,
        discardedAt: null,
        createdAt: draft.createdAt.toISOString(),
        updatedAt: draft.updatedAt.toISOString(),
      })),
    };
  }
}
