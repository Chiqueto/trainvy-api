import { advancedPrescription } from "../schemas/advanced-prescription.js";
import {
  assertCoachCanPrescribe,
  CoachPrescriptionError,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class GetWorkoutPlanTemplateDetails {
  async execute({
    coachId,
    templateId,
  }: {
    coachId: string;
    templateId: string;
  }) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });
    assertCoachCanPrescribe(commercialContext);

    const template = await prisma.workoutPlanTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template || template.coachId !== coachId) {
      throw new CoachPrescriptionError(
        "TEMPLATE_NOT_FOUND",
        404,
        "Modelo de treino não encontrado.",
      );
    }

    return {
      id: template.id,
      coachId: template.coachId,
      name: template.name,
      description: template.description,
      payload: template.payload as unknown as PrescriptionPayload,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }
}

export interface UpdateWorkoutPlanTemplateInput {
  coachId: string;
  templateId: string;
  name: string;
  description?: string | null;
  workoutDays: Array<{
    name: string;
    order?: number;
    weekDay?:
      | "MONDAY"
      | "TUESDAY"
      | "WEDNESDAY"
      | "THURSDAY"
      | "FRIDAY"
      | "SATURDAY"
      | "SUNDAY";
    isRest: boolean;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string | null;
    exercises: Array<{
      order: number;
      name: string;
      alternative1ExerciseName?: string | null;
      alternative2ExerciseName?: string | null;
      sets: number;
      warmupSets?: number;
      reps: number;
      repsMin?: number | null;
      repsMax?: number | null;
      targetRir?: number | null;
      targetLoadInGrams?: number | null;
      tempo?: string | null;
      restTimeInSeconds: number;
    }>;
  }>;
}

export class UpdateWorkoutPlanTemplate {
  async execute(dto: UpdateWorkoutPlanTemplateInput) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: dto.coachId,
    });
    assertCoachCanPrescribe(commercialContext);

    const existing = await prisma.workoutPlanTemplate.findUnique({
      where: { id: dto.templateId },
    });

    if (!existing || existing.coachId !== dto.coachId) {
      throw new CoachPrescriptionError(
        "TEMPLATE_NOT_FOUND",
        404,
        "Modelo de treino não encontrado.",
      );
    }

    const trimmedName = dto.name?.trim();
    if (!trimmedName) {
      throw new CoachPrescriptionError(
        "INVALID_TEMPLATE_PAYLOAD",
        400,
        "Nome do modelo de treino é obrigatório.",
      );
    }

    if (!Array.isArray(dto.workoutDays) || dto.workoutDays.length === 0) {
      throw new CoachPrescriptionError(
        "INVALID_TEMPLATE_PAYLOAD",
        400,
        "O modelo deve conter pelo menos um dia.",
      );
    }

    const payload = {
      workoutDays: dto.workoutDays.map((day, index) => ({
        name: day.name.trim(),
        order: day.order ?? index,
        weekDay: day.weekDay ?? "MONDAY",
        isRest: day.isRest,
        estimatedDurationInSeconds: day.estimatedDurationInSeconds,
        coverImageUrl: day.coverImageUrl ?? null,
        exercises: day.exercises.map((ex, exIndex) => {
          const name = ex.name.trim();
          let alt1 = ex.alternative1ExerciseName?.trim() || null;
          let alt2 = ex.alternative2ExerciseName?.trim() || null;

          if (alt1 && alt1.toLowerCase() === name.toLowerCase()) alt1 = null;
          if (alt2 && alt2.toLowerCase() === name.toLowerCase()) alt2 = null;
          if (alt1 && alt2 && alt1.toLowerCase() === alt2.toLowerCase())
            alt2 = null;
          if (!alt1 && alt2) {
            alt1 = alt2;
            alt2 = null;
          }

          return {
            order: ex.order ?? exIndex,
            name,
            alternative1ExerciseName: alt1,
            alternative2ExerciseName: alt2,
            sets: ex.sets,
            warmupSets: ex.warmupSets ?? 0,
            reps: ex.reps,
            ...advancedPrescription(ex),
            restTimeInSeconds: ex.restTimeInSeconds,
          };
        }),
      })),
    };

    const updated = await prisma.workoutPlanTemplate.update({
      where: { id: dto.templateId },
      data: {
        name: trimmedName,
        description: dto.description?.trim() || null,
        payload,
      },
    });

    return {
      id: updated.id,
      coachId: updated.coachId,
      name: updated.name,
      description: updated.description,
      payload: updated.payload as unknown as PrescriptionPayload,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}

export class DeleteWorkoutPlanTemplate {
  async execute({
    coachId,
    templateId,
  }: {
    coachId: string;
    templateId: string;
  }) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });
    assertCoachCanPrescribe(commercialContext);

    const existing = await prisma.workoutPlanTemplate.findUnique({
      where: { id: templateId },
    });

    if (!existing || existing.coachId !== coachId) {
      throw new CoachPrescriptionError(
        "TEMPLATE_NOT_FOUND",
        404,
        "Modelo de treino não encontrado.",
      );
    }

    await prisma.workoutPlanTemplate.delete({
      where: { id: templateId },
    });

    return { success: true };
  }
}
