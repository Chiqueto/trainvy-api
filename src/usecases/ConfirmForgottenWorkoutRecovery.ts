import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

import { checkRecoveryConflicts } from "../domain/recovery-conflicts.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import type {
  ConfirmForgottenWorkoutRecoveryBody,
  ForgottenWorkoutDraftDto,
  ForgottenWorkoutExercise,
} from "../schemas/index.js";

dayjs.extend(utc);
dayjs.extend(timezone);

interface ConfirmForgottenWorkoutRecoveryInput extends ConfirmForgottenWorkoutRecoveryBody {
  userId: string;
  draftId: string;
}

export interface ConfirmForgottenWorkoutRecoveryOutput {
  success: boolean;
  sessionId: string;
  draft: ForgottenWorkoutDraftDto;
}

export class ConfirmForgottenWorkoutRecovery {
  async execute(
    input: ConfirmForgottenWorkoutRecoveryInput,
  ): Promise<ConfirmForgottenWorkoutRecoveryOutput> {
    const { userId, draftId, clientRevision, idempotencyKey, confirmConflict } = input;

    // 1. Busca inicial e validações preliminares
    const initialDraft = await prisma.forgottenWorkoutDraft.findUnique({
      where: { id: draftId },
      include: { confirmedSession: true },
    });

    if (!initialDraft) {
      throw new NotFoundError("Rascunho não encontrado.");
    }

    if (initialDraft.userId !== userId) {
      throw new ForbiddenError("Acesso negado a este rascunho de treino.");
    }

    // Idempotência: se já confirmado, retorna a sessão associada
    if (initialDraft.status === "CONFIRMED") {
      if (!initialDraft.confirmedSession) {
        throw new ConflictError("Rascunho confirmado sem sessão associada registrada.");
      }
      return {
        success: true,
        sessionId: initialDraft.confirmedSession.id,
        draft: this.mapToDto(initialDraft, initialDraft.confirmedSession.id),
      };
    }

    if (initialDraft.status === "DISCARDED") {
      throw new ConflictError("Este rascunho foi descartado e não pode ser confirmado.");
    }

    const now = new Date();
    if (initialDraft.expiresAt.getTime() < now.getTime() || initialDraft.status === "EXPIRED") {
      if (initialDraft.status !== "EXPIRED") {
        await prisma.forgottenWorkoutDraft.update({
          where: { id: initialDraft.id },
          data: { status: "EXPIRED" },
        });
      }
      throw new ConflictError("Este rascunho expirou. Inicie uma nova recuperação de treino.");
    }

    // 2. Revisão do rascunho: impede confirmação se houver divergência
    if (initialDraft.revision !== clientRevision) {
      throw new ConflictError(
        "O rascunho foi modificado após sua revisão. Recarregue a página para confirmar a versão atual.",
      );
    }

    // 3. Verificação de conflitos de data e horário no fuso do atleta
    const sessionDateStr = initialDraft.sessionDate.toISOString().split("T")[0];
    const conflicts = await checkRecoveryConflicts({
      userId,
      sessionDateStr,
      timezone: initialDraft.timezone,
      workoutDayId: initialDraft.workoutDayId,
      startedAt: initialDraft.startedAt,
      completedAt: initialDraft.completedAt,
    });

    if (conflicts.hasConflict && !confirmConflict) {
      throw new ConflictError(
        conflicts.reason ||
          "Foram detectados potenciais conflitos de treino para esta data. Confirme explicitamente para registrar este treino.",
        "POTENTIAL_CONFLICT_DETECTED",
      );
    }

    // 4. Execução atômica e serializada no escopo do atleta
    const confirmedSessionId = await prisma.$transaction(async (tx) => {
      // Serialização rigorosa para o atleta contra race conditions de confirmações concorrentes
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('recovery:' || ${userId}))`;

      // Re-valida o rascunho sob lock
      const freshDraft = await tx.forgottenWorkoutDraft.findUnique({
        where: { id: draftId },
        include: { confirmedSession: true },
      });

      if (!freshDraft) {
        throw new NotFoundError("Rascunho não encontrado.");
      }

      if (freshDraft.status === "CONFIRMED" && freshDraft.confirmedSession) {
        return freshDraft.confirmedSession.id;
      }

      if (freshDraft.status !== "DRAFT" || freshDraft.revision !== clientRevision) {
        throw new ConflictError("Rascunho modificado ou não está mais ativo para confirmação.");
      }

      // Determinação estável de timestamps sem fabricar horários
      let sessionStartedAt: Date;
      let sessionCompletedAt: Date;

      if (
        freshDraft.timePrecision === "EXACT_TIME" &&
        freshDraft.startedAt &&
        freshDraft.completedAt
      ) {
        sessionStartedAt = freshDraft.startedAt;
        sessionCompletedAt = freshDraft.completedAt;
      } else {
        // Horário do meio-dia no fuso local do atleta (proteção contra shifts de fuso/DST)
        const noon = dayjs.tz(`${sessionDateStr} 12:00:00`, freshDraft.timezone).toDate();
        sessionStartedAt = noon;
        sessionCompletedAt = noon;
      }

      // Validação de prescrição / plano quando informados
      let planNameSnapshot: string | null = null;
      let dayNameSnapshot: string | null = null;
      let origin: "PLANNED" | "FREE" = "FREE";

      if (freshDraft.workoutPlanId && freshDraft.workoutDayId) {
        const plan = await tx.workoutPlan.findFirst({
          where: { id: freshDraft.workoutPlanId, userId },
        });
        const day = await tx.workoutDay.findFirst({
          where: { id: freshDraft.workoutDayId, workoutPlanId: freshDraft.workoutPlanId },
        });

        if (plan && day) {
          planNameSnapshot = plan.name;
          dayNameSnapshot = day.name;
          origin = "PLANNED";
        }
      }

      const sessionDateDb = new Date(`${sessionDateStr}T00:00:00.000Z`);

      // 5. Criação da WorkoutSession
      const session = await tx.workoutSession.create({
        data: {
          athleteId: userId,
          origin,
          workoutPlanId: origin === "PLANNED" ? freshDraft.workoutPlanId : null,
          workoutDayId: origin === "PLANNED" ? freshDraft.workoutDayId : null,
          workoutPlanNameSnapshot: planNameSnapshot,
          workoutDayNameSnapshot: dayNameSnapshot,
          sessionDate: sessionDateDb,
          timePrecision: freshDraft.timePrecision,
          isRetroactive: true,
          recoveryDraftId: freshDraft.id,
          startedAt: sessionStartedAt,
          completedAt: sessionCompletedAt,
        },
      });

      // 6. Criação de SessionExercises e WorkoutSets com snapshots imutáveis
      const proposedExercises = freshDraft.proposedExercises as ForgottenWorkoutExercise[];

      for (const ex of proposedExercises) {
        const sessionExercise = await tx.sessionExercise.create({
          data: {
            workoutSessionId: session.id,
            exerciseId: ex.exerciseId,
            exerciseNameSnapshot: ex.exerciseNameSnapshot,
            order: ex.order,
            plannedSets: null,
            plannedReps: null,
          },
        });

        for (const set of ex.sets) {
          await tx.workoutSet.create({
            data: {
              sessionExerciseId: sessionExercise.id,
              exerciseId: ex.exerciseId,
              exerciseNameSnapshot: ex.exerciseNameSnapshot,
              order: set.order,
              type: set.type,
              weightInGrams: Math.round(set.weightKg * 1000),
              reps: set.reps,
              rir: set.rir ?? null,
              completedAt: sessionCompletedAt,
            },
          });
        }
      }

      // 7. Transição do rascunho para CONFIRMED
      await tx.forgottenWorkoutDraft.update({
        where: { id: freshDraft.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });

      return session.id;
    });

    const finalizedDraft = await prisma.forgottenWorkoutDraft.findUnique({
      where: { id: draftId },
    });

    return {
      success: true,
      sessionId: confirmedSessionId,
      draft: this.mapToDto(finalizedDraft, confirmedSessionId),
    };
  }

  private mapToDto(draft: any, confirmedSessionId?: string | null): ForgottenWorkoutDraftDto {
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
      confirmedSessionId: confirmedSessionId ?? draft.confirmedSessionId ?? null,
      idempotencyKey: draft.idempotencyKey,
      expiresAt: draft.expiresAt.toISOString(),
      confirmedAt: draft.confirmedAt ? draft.confirmedAt.toISOString() : null,
      discardedAt: draft.discardedAt ? draft.discardedAt.toISOString() : null,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }
}
