import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

import {
  getTodayLocalDate,
  validateCivilDate,
  validateIanaTimezone,
} from "../domain/analytics-dates.js";
import {
  BadRequestError,
  ForbiddenError,
  InvalidDateRangeError,
  NotFoundError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";
import type {
  CreateForgottenWorkoutDraftBody,
  ForgottenWorkoutDraftDto,
  ForgottenWorkoutExercise,
} from "../schemas/index.js";

dayjs.extend(utc);
dayjs.extend(timezone);

interface CreateForgottenWorkoutDraftInput extends CreateForgottenWorkoutDraftBody {
  userId: string;
}

export class CreateForgottenWorkoutDraft {
  async execute(input: CreateForgottenWorkoutDraftInput): Promise<ForgottenWorkoutDraftDto> {
    const {
      userId,
      date,
      timezone: tzInput,
      title,
      conversationId,
      workoutPlanId,
      workoutDayId,
      startedAt,
      completedAt,
      exercises,
      idempotencyKey,
    } = input;

    // 1. Validação determinística de fuso horário IANA e data civil
    const tz = validateIanaTimezone(tzInput);
    const validDate = validateCivilDate(date, "date");

    // 2. Não permitir datas no futuro
    const todayLocal = getTodayLocalDate(tz, new Date());
    if (validDate > todayLocal) {
      throw new ForbiddenError("A data do treino não pode ser no futuro.");
    }

    // 3. Validação de precisão temporal e horários
    let timePrecision: "EXACT_TIME" | "DATE_ONLY" = "DATE_ONLY";
    let startedAtDate: Date | null = null;
    let completedAtDate: Date | null = null;

    if (startedAt && completedAt) {
      startedAtDate = new Date(startedAt);
      completedAtDate = new Date(completedAt);

      if (Number.isNaN(startedAtDate.getTime()) || Number.isNaN(completedAtDate.getTime())) {
        throw new BadRequestError("Formato de horário inválido para startedAt ou completedAt.");
      }

      if (startedAtDate.getTime() > completedAtDate.getTime()) {
        throw new InvalidDateRangeError("O horário de início deve ser anterior ao de término.");
      }

      const now = new Date();
      if (completedAtDate.getTime() > now.getTime()) {
        throw new ForbiddenError("O horário de término do treino não pode ser no futuro.");
      }

      timePrecision = "EXACT_TIME";
    }

    // 4. Idempotência por chave
    if (idempotencyKey) {
      const existing = await prisma.forgottenWorkoutDraft.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        if (existing.userId !== userId) {
          throw new ForbiddenError("Chave de idempotência pertence a outro usuário.");
        }
        return this.mapToDto(existing);
      }
    }

    // 5. Validação de conversa (se informada)
    if (conversationId) {
      const conv = await prisma.aiConversation.findFirst({
        where: { id: conversationId, userId },
      });
      if (!conv) {
        throw new NotFoundError("Conversa não encontrada ou não autorizada.");
      }
    }

    // 6. Associação com plano/dia (quando informados explicitamente)
    let validPlanId: string | null = null;
    let validDayId: string | null = null;
    let origin: "PLANNED" | "FREE" = "FREE";

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
      }
    }

    // 7. Validação rigorosa dos exercícios (apenas exercícios públicos ou próprios)
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

    // Preenche snapshots reais a partir do banco de dados (não aceita nomes adulterados)
    const sanitizedExercises: ForgottenWorkoutExercise[] = exercises.map((ex, exIdx) => {
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

    // 8. Persistência do rascunho com TTL de 2 horas
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const sessionDateDb = new Date(`${validDate}T00:00:00.000Z`);

    const draft = await prisma.forgottenWorkoutDraft.create({
      data: {
        userId,
        conversationId: conversationId ?? null,
        revision: 1,
        status: "DRAFT",
        sessionDate: sessionDateDb,
        timePrecision,
        startedAt: startedAtDate,
        completedAt: completedAtDate,
        timezone: tz,
        workoutPlanId: validPlanId,
        workoutDayId: validDayId,
        title: title.trim(),
        origin,
        proposedExercises: sanitizedExercises as any,
        idempotencyKey: idempotencyKey ?? null,
        expiresAt,
      },
    });

    return this.mapToDto(draft);
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
      confirmedSessionId: draft.confirmedSessionId,
      idempotencyKey: draft.idempotencyKey,
      expiresAt: draft.expiresAt.toISOString(),
      confirmedAt: draft.confirmedAt ? draft.confirmedAt.toISOString() : null,
      discardedAt: draft.discardedAt ? draft.discardedAt.toISOString() : null,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }
}
