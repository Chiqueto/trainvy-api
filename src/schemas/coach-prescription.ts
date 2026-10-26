import z from "zod";

export const WorkoutExerciseDraftSchema = z.object({
  name: z.string().trim().min(1, "Nome do exercício é obrigatório"),
  order: z.number().int().min(0),
  exerciseId: z.string().uuid().nullable().optional(),
  alternative1ExerciseId: z.string().uuid().nullable().optional(),
  alternative1ExerciseName: z.string().nullable().optional(),
  alternative2ExerciseId: z.string().uuid().nullable().optional(),
  alternative2ExerciseName: z.string().nullable().optional(),
  sets: z.number().int().min(1, "Mínimo de 1 série"),
  warmupSets: z.number().int().min(0).default(0),
  reps: z.number().int().min(1, "Mínimo de 1 repetição"),
  restTimeInSeconds: z.number().int().min(1, "Mínimo de 1 segundo"),
});

export const WorkoutDayDraftSchema = z
  .object({
    name: z.string().trim().min(1, "Nome do treino é obrigatório"),
    order: z.number().int().min(0).optional(),
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
      .default("MONDAY"),
    isRest: z.boolean().default(false),
    estimatedDurationInSeconds: z.number().int().min(0),
    coverImageUrl: z.string().nullable().optional(),
    exercises: z.array(WorkoutExerciseDraftSchema),
  })
  .superRefine((data, ctx) => {
    if (data.isRest) {
      if (data.estimatedDurationInSeconds !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Dias de descanso devem ter estimatedDurationInSeconds igual a 0",
          path: ["estimatedDurationInSeconds"],
        });
      }
      if (data.exercises.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Dias de descanso não devem conter exercícios",
          path: ["exercises"],
        });
      }
    } else {
      if (data.estimatedDurationInSeconds <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Dias de treino devem ter estimatedDurationInSeconds maior que 0",
          path: ["estimatedDurationInSeconds"],
        });
      }
      if (data.exercises.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Dias de treino devem conter pelo menos um exercício",
          path: ["exercises"],
        });
      }
    }
  });

export const CreatePrescriptionDraftBodySchema = z.object({
  athleteId: z.string(),
  name: z.string().trim().min(1, "Nome do planejamento é obrigatório").max(100),
  notes: z.string().trim().max(1000).optional().nullable(),
  workoutDays: z
    .array(WorkoutDayDraftSchema)
    .min(1, "O planejamento deve conter pelo menos 1 dia"),
});

export const UpdatePrescriptionDraftBodySchema = z.object({
  name: z.string().trim().min(1, "Nome do planejamento é obrigatório").max(100),
  notes: z.string().trim().max(1000).optional().nullable(),
  version: z.number().int().positive().optional(),
  workoutDays: z
    .array(WorkoutDayDraftSchema)
    .min(1, "O planejamento deve conter pelo menos 1 dia"),
});

export const PrescriptionExerciseItemSchema = z.object({
  name: z.string(),
  order: z.number(),
  exerciseId: z.string().nullable().optional(),
  alternative1ExerciseId: z.string().nullable().optional(),
  alternative1ExerciseName: z.string().nullable().optional(),
  alternative2ExerciseId: z.string().nullable().optional(),
  alternative2ExerciseName: z.string().nullable().optional(),
  sets: z.number(),
  warmupSets: z.number(),
  reps: z.number(),
  restTimeInSeconds: z.number(),
});

export const PrescriptionDayItemSchema = z.object({
  name: z.string(),
  order: z.number(),
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
  estimatedDurationInSeconds: z.number(),
  coverImageUrl: z.string().nullable().optional(),
  exercises: z.array(PrescriptionExerciseItemSchema),
});

export const PrescriptionPayloadSchema = z.object({
  workoutDays: z.array(PrescriptionDayItemSchema),
});

export const PrescriptionUserSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  image: z.string().nullable().optional(),
});

export const PrescriptionItemResponseSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  athleteId: z.string(),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "CANCELLED"]),
  name: z.string(),
  notes: z.string().nullable(),
  version: z.number(),
  acceptedWorkoutPlanId: z.string().nullable(),
  sentAt: z.string().nullable(),
  respondedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  coach: PrescriptionUserSummarySchema.optional(),
  athlete: PrescriptionUserSummarySchema.optional(),
  payload: PrescriptionPayloadSchema.optional(),
});

export const ListPrescriptionsResponseSchema = z.array(
  PrescriptionItemResponseSchema,
);

export const AcceptPrescriptionResponseSchema = z.object({
  success: z.boolean(),
  prescription: PrescriptionItemResponseSchema,
  workoutPlanId: z.string(),
  workoutPlanName: z.string(),
});

export const PrescriptionIdParamsSchema = z.object({
  id: z.string(),
});

export const CoachAthletePrescriptionsParamsSchema = z.object({
  athleteId: z.string(),
});

// Coach: AI Prescription Draft Generation
export const GenerateCoachPrescriptionDraftBodySchema = z.object({
  athleteId: z.string(),
  prompt: z.string().trim().min(2, "Instrução de prescrição é obrigatória"),
  fileUrl: z.string().optional(),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
});

export const GenerateCoachPrescriptionDraftResponseSchema = z.object({
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
