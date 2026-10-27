import z from "zod";

import {
  PrescriptionItemResponseSchema,
  PrescriptionPayloadSchema,
  WorkoutDayDraftSchema,
} from "./coach-prescription.js";

export const CreateWorkoutPlanTemplateBodySchema = z.object({
  name: z.string().trim().min(1, "Nome do modelo é obrigatório").max(100),
  description: z.string().trim().max(1000).optional().nullable(),
  workoutDays: z
    .array(WorkoutDayDraftSchema)
    .min(1, "O modelo deve conter pelo menos 1 dia"),
});

export const UpdateWorkoutPlanTemplateBodySchema = z.object({
  name: z.string().trim().min(1, "Nome do modelo é obrigatório").max(100),
  description: z.string().trim().max(1000).optional().nullable(),
  workoutDays: z
    .array(WorkoutDayDraftSchema)
    .min(1, "O modelo deve conter pelo menos 1 dia"),
});

export const CreateTemplateFromPlanBodySchema = z.object({
  name: z.string().trim().max(100).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
});

export const AllocateTemplateBodySchema = z.object({
  athleteId: z.string().min(1, "ID do aluno é obrigatório"),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const TemplateIdParamsSchema = z.object({
  id: z.string(),
});

export const PlanIdParamsSchema = z.object({
  planId: z.string(),
});

export const TemplateItemResponseSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  payload: PrescriptionPayloadSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ListTemplatesResponseSchema = z.array(TemplateItemResponseSchema);

export const AllocateTemplateResponseSchema = z.object({
  success: z.boolean(),
  prescription: PrescriptionItemResponseSchema,
});
