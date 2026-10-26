import z from "zod";

export const GenerateWorkoutPlanDraftWithAiBodySchema = z.object({
  prompt: z.string().trim().min(2, "Instrução ou descrição do treino é obrigatória"),
  fileUrl: z.string().optional(),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
});

export const GenerateWorkoutPlanDraftWithAiResponseSchema = z.object({
  name: z.string(),
  notes: z.string().nullable().optional(),
  workoutDays: z.array(
    z.object({
      name: z.string(),
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
      estimatedDurationInMinutes: z.number(),
      exercises: z.array(
        z.object({
          name: z.string(),
          sets: z.number(),
          warmupSets: z.number().default(0),
          reps: z.number(),
          restTimeInSeconds: z.number(),
          alternative1Name: z.string().nullable().optional(),
          alternative2Name: z.string().nullable().optional(),
        })
      ),
    })
  ),
});
