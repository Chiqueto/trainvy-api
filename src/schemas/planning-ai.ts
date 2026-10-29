import z from "zod";

import {
  WorkoutDayDraftSchema,
  WorkoutExerciseDraftSchema,
} from "./coach-prescription.js";
export const GenerateWorkoutPlanDraftWithAiBodySchema = z.strictObject({
  prompt: z.string().trim().min(2).max(20000),
  fileUrl: z.string().max(14000000).optional(),
  mediaType: z.string().max(100).optional(),
  filename: z.string().max(200).optional(),
});
export const ExtractedWorkoutSchema = z.object({
  name: z.string().max(180).nullable(),
  workoutDays: z
    .array(
      z.object({
        name: z.string().max(180).nullable(),
        weekDay: z
          .enum([
            "MONDAY",
            "TUESDAY",
            "WEDNESDAY",
            "THURSDAY",
            "FRIDAY",
            "SATURDAY",
            "SUNDAY",
          ])
          .nullable(),
        isRest: z.boolean().nullable(),
        estimatedDurationInSeconds: z
          .number()
          .int()
          .min(0)
          .max(86400)
          .nullable(),
        exercises: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(180),
              sets: z.number().int().min(1).max(100).nullable(),
              reps: z.number().int().min(1).max(500).nullable(),
              warmupSets: z.number().int().min(0).max(100).nullable(),
              restTimeInSeconds: z.number().int().min(0).max(3600).nullable(),
              targetLoadInGrams: z
                .number()
                .int()
                .min(0)
                .max(1000000)
                .nullable(),
              targetRir: z.number().int().min(0).max(10).nullable(),
              tempo: z.string().max(100).nullable(),
            }),
          )
          .max(40),
      }),
    )
    .max(7),
  provenance: z
    .array(
      z.object({
        path: z.string().max(200),
        quote: z.string().min(1).max(500),
      }),
    )
    .max(1000),
  questions: z.array(z.string().max(500)).max(30),
});
export const GenerateWorkoutPlanDraftWithAiResponseSchema =
  ExtractedWorkoutSchema.extend({
    previewToken: z.string(),
    requiresConfirmation: z.literal(true),
  });
export const ConfirmWorkoutImportBody = z.strictObject({
  previewToken: z.string().max(300000),
  confirmed: z.literal(true),
  name: z.string().trim().min(1).max(180),
  workoutDays: z
    .array(
      WorkoutDayDraftSchema.safeExtend({
        weekDay: z.enum([
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
          "SATURDAY",
          "SUNDAY",
        ]),
        isRest: z.boolean(),
        exercises: z.array(
          WorkoutExerciseDraftSchema.safeExtend({
            warmupSets: z.number().int().min(0),
          }),
        ),
      }),
    )
    .min(1)
    .max(7),
});
