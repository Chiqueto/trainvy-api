import {
  getTodayLocalDate,
  validateCivilDate,
  validateIanaTimezone,
} from "../domain/analytics-dates.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InvalidDateRangeError,
  NotFoundError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";
import type {
  ForgottenWorkoutDraftDto,
  ForgottenWorkoutExercise,
  UpdateForgottenWorkoutDraftBody,
} from "../schemas/index.js";

interface UpdateForgottenWorkoutDraftInput extends UpdateForgottenWorkoutDraftBody {
  userId: string;
  draftId: string;
}

export class UpdateForgottenWorkoutDraft {
  async execute(input: UpdateForgottenWorkoutDraftInput): Promise<ForgottenWorkoutDraftDto> {
    const {
      userId,
      draftId,
      clientRevision,
      date,
      timezone: tzInput,
      title,
      workoutPlanId,
      workoutDayId,
      startedAt,
      completedAt,
      exercises,
    } = input;

    const draft = await prisma.forgottenWorkoutDraft.findUnique({
      where: { id: draftId },
    });

    if (!draft) {
      throw new NotFoundError("Rascunho não encontrado.");
    }

    if (draft.userId !== userId) {
      throw new ForbiddenError("Acesso negado a este rascunho de treino.");
    }

    if (draft.status !== "DRAFT") {
      throw new ConflictError(
        `Apenas rascunhos em estado DRAFT podem ser editados. Status atual: ${draft.status}.`,
      );
    }

    const now = new Date();
    if (draft.expiresAt.getTime() < now.getTime()) {
      await prisma.forgottenWorkoutDraft.update({
        where: { id: draft.id },
        data: { status: "EXPIRED" },
      });
      throw new ConflictError("Este rascunho expirou e não pode mais ser editado.");
    }

    // Validação de revisão otimista
    if (draft.revision !== clientRevision) {
      throw new ConflictError(
        "O rascunho foi modificado por outra ação. Recarregue a versão mais recente para editar.",
      );
    }

    // 1. Timezone e Data
    const tz = tzInput ? validateIanaTimezone(tzInput) : draft.timezone;
    const validDate = date ? validateCivilDate(date, "date") : draft.sessionDate.toISOString().split("T")[0];

    const todayLocal = getTodayLocalDate(tz, now);
    if (validDate > todayLocal) {
      throw new ForbiddenError("A data do treino não pode ser no futuro.");
    }

    // 2. Horários e Precisão Temporal
    let timePrecision: "EXACT_TIME" | "DATE_ONLY" = draft.timePrecision;
    let startedAtDate: Date | null = draft.startedAt;
    let completedAtDate: Date | null = draft.completedAt;

    if (startedAt !== undefined || completedAt !== undefined) {
      if (startedAt && completedAt) {
        startedAtDate = new Date(startedAt);
        completedAtDate = new Date(completedAt);

        if (Number.isNaN(startedAtDate.getTime()) || Number.isNaN(completedAtDate.getTime())) {
          throw new BadRequestError("Formato de horário inválido para startedAt ou completedAt.");
        }

        if (startedAtDate.getTime() > completedAtDate.getTime()) {
          throw new InvalidDateRangeError("O horário de início deve ser anterior ao de término.");
        }

        if (completedAtDate.getTime() > now.getTime()) {
          throw new ForbiddenError("O horário de término do treino não pode ser no futuro.");
        }

        timePrecision = "EXACT_TIME";
      } else {
        // Se um deles for nulo ou vazio, preserva DATE_ONLY sem dados inventados
        startedAtDate = null;
        completedAtDate = null;
        timePrecision = "DATE_ONLY";
      }
    }

    // 3. Plano e Dia
    let validPlanId: string | null = draft.workoutPlanId;
    let validDayId: string | null = draft.workoutDayId;
    let origin: "PLANNED" | "FREE" = draft.origin;

    if (workoutPlanId !== undefined || workoutDayId !== undefined) {
      if (workoutPlanId && workoutDayId) {
        const plan = await prisma.workoutPlan.findFirst({
          where: { id: workoutPlanId, userId },
        });
        const day = await prisma.workoutDay.findFirst({
          where: { id: workoutDayId, workoutPlanId },
        });

        if (plan && day) {
          validPlanId = plan.id;
          validDayId = day.id;
          origin = "PLANNED";
        } else {
          validPlanId = null;
          validDayId = null;
          origin = "FREE";
        }
      } else {
        validPlanId = null;
        validDayId = null;
        origin = "FREE";
      }
    }

    // 4. Exercícios
    let sanitizedExercises = draft.proposedExercises as ForgottenWorkoutExercise[];
    if (exercises && exercises.length > 0) {
      const exerciseIds = [...new Set(exercises.map((e) => e.exerciseId))];
      const dbExercises = await prisma.exercise.findMany({
        where: {
          id: { in: exerciseIds },
          OR: [{ ownerUserId: null }, { ownerUserId: userId }],
        },
        select: { id: true, name: true },
      });

      const dbExerciseMap = new Map(dbExercises.map((e) => [e.id, e.name]));
      for (const exId of exerciseIds) {
        if (!dbExerciseMap.has(exId)) {
          throw new NotFoundError(
            `Exercício ${exId} não encontrado ou não acessível ao atleta no catálogo.`,
          );
        }
      }

      sanitizedExercises = exercises.map((ex, exIdx) => {
        const realName = dbExerciseMap.get(ex.exerciseId)!;
        return {
          order: ex.order ?? exIdx + 1,
          exerciseId: ex.exerciseId,
          exerciseNameSnapshot: realName,
          sets: ex.sets.map((s, sIdx) => ({
            order: s.order ?? sIdx + 1,
            type: s.type ?? "WORKING",
            weightKg: Number(s.weightKg) || 0,
            reps: Math.max(1, Math.floor(Number(s.reps) || 1)),
            rir: s.rir !== undefined && s.rir !== null ? Math.max(0, Math.min(10, Math.floor(s.rir))) : null,
          })),
        };
      });
    }

    const sessionDateDb = new Date(`${validDate}T00:00:00.000Z`);
    const newExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const updated = await prisma.forgottenWorkoutDraft.update({
      where: { id: draft.id },
      data: {
        revision: draft.revision + 1,
        title: title !== undefined ? title.trim() : draft.title,
        sessionDate: sessionDateDb,
        timezone: tz,
        timePrecision,
        startedAt: startedAtDate,
        completedAt: completedAtDate,
        workoutPlanId: validPlanId,
        workoutDayId: validDayId,
        origin,
        proposedExercises: sanitizedExercises as any,
        expiresAt: newExpiresAt,
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      conversationId: updated.conversationId,
      revision: updated.revision,
      status: updated.status,
      sessionDate: updated.sessionDate.toISOString().split("T")[0],
      timePrecision: updated.timePrecision,
      startedAt: updated.startedAt ? updated.startedAt.toISOString() : null,
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      timezone: updated.timezone,
      workoutPlanId: updated.workoutPlanId,
      workoutDayId: updated.workoutDayId,
      title: updated.title,
      origin: updated.origin,
      proposedExercises: updated.proposedExercises as any,
      confirmedSessionId: null,
      idempotencyKey: updated.idempotencyKey,
      expiresAt: updated.expiresAt.toISOString(),
      confirmedAt: updated.confirmedAt ? updated.confirmedAt.toISOString() : null,
      discardedAt: updated.discardedAt ? updated.discardedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
