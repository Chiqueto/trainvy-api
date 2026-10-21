import { ConflictError, ForbiddenError, NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import type { ForgottenWorkoutDraftDto } from "../schemas/index.js";

interface DiscardForgottenWorkoutDraftInput {
  userId: string;
  draftId: string;
}

export class DiscardForgottenWorkoutDraft {
  async execute(input: DiscardForgottenWorkoutDraftInput): Promise<ForgottenWorkoutDraftDto> {
    const { userId, draftId } = input;

    const draft = await prisma.forgottenWorkoutDraft.findUnique({
      where: { id: draftId },
      include: { confirmedSession: true },
    });

    if (!draft) {
      throw new NotFoundError("Rascunho não encontrado.");
    }

    if (draft.userId !== userId) {
      throw new ForbiddenError("Acesso negado a este rascunho de treino.");
    }

    if (draft.status === "CONFIRMED") {
      throw new ConflictError("Não é possível descartar um rascunho que já foi confirmado.");
    }

    if (draft.status === "DISCARDED") {
      return this.mapToDto(draft);
    }

    const updated = await prisma.forgottenWorkoutDraft.update({
      where: { id: draft.id },
      data: {
        status: "DISCARDED",
        discardedAt: new Date(),
      },
      include: { confirmedSession: true },
    });

    return this.mapToDto(updated);
  }

  private mapToDto(draft: any): ForgottenWorkoutDraftDto {
    return {
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
      proposedExercises: draft.proposedExercises,
      confirmedSessionId: draft.confirmedSession?.id ?? null,
      idempotencyKey: draft.idempotencyKey,
      expiresAt: draft.expiresAt.toISOString(),
      confirmedAt: draft.confirmedAt ? draft.confirmedAt.toISOString() : null,
      discardedAt: draft.discardedAt ? draft.discardedAt.toISOString() : null,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }
}
