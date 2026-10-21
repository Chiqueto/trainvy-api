import { checkRecoveryConflicts } from "../domain/recovery-conflicts.js";
import { ForbiddenError, NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import type {
  ForgottenWorkoutDraftDto,
  GetForgottenWorkoutDraftResponse,
} from "../schemas/index.js";

interface GetForgottenWorkoutDraftInput {
  userId: string;
  draftId: string;
}

export class GetForgottenWorkoutDraft {
  async execute(input: GetForgottenWorkoutDraftInput): Promise<GetForgottenWorkoutDraftResponse> {
    const { userId, draftId } = input;

    const draft = await prisma.forgottenWorkoutDraft.findUnique({
      where: { id: draftId },
      include: { confirmedSession: true },
    });

    if (!draft) {
      throw new NotFoundError("Rascunho de treino esquecido não encontrado.");
    }

    if (draft.userId !== userId) {
      throw new ForbiddenError("Acesso negado a este rascunho de treino.");
    }

    // Auto-expiração se o TTL foi atingido
    const now = new Date();
    let currentStatus = draft.status;
    if (draft.status === "DRAFT" && draft.expiresAt.getTime() < now.getTime()) {
      currentStatus = "EXPIRED";
      await prisma.forgottenWorkoutDraft.update({
        where: { id: draft.id },
        data: { status: "EXPIRED" },
      });
    }

    const sessionDateStr = draft.sessionDate.toISOString().split("T")[0];

    // Detecção de conflitos no fuso do atleta
    const conflicts = await checkRecoveryConflicts({
      userId,
      sessionDateStr,
      timezone: draft.timezone,
      workoutDayId: draft.workoutDayId,
      startedAt: draft.startedAt,
      completedAt: draft.completedAt,
      excludeSessionId: draft.confirmedSession?.id,
    });

    const draftDto: ForgottenWorkoutDraftDto = {
      id: draft.id,
      userId: draft.userId,
      conversationId: draft.conversationId,
      revision: draft.revision,
      status: currentStatus,
      sessionDate: sessionDateStr,
      timePrecision: draft.timePrecision,
      startedAt: draft.startedAt ? draft.startedAt.toISOString() : null,
      completedAt: draft.completedAt ? draft.completedAt.toISOString() : null,
      timezone: draft.timezone,
      workoutPlanId: draft.workoutPlanId,
      workoutDayId: draft.workoutDayId,
      title: draft.title,
      origin: draft.origin,
      proposedExercises: draft.proposedExercises as any,
      confirmedSessionId: draft.confirmedSession?.id ?? null,
      idempotencyKey: draft.idempotencyKey,
      expiresAt: draft.expiresAt.toISOString(),
      confirmedAt: draft.confirmedAt ? draft.confirmedAt.toISOString() : null,
      discardedAt: draft.discardedAt ? draft.discardedAt.toISOString() : null,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    };

    return {
      draft: draftDto,
      conflicts,
    };
  }
}
