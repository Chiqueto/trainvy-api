import z from "zod";

import {
  ExerciseResponseSchema,
  GetExerciseEvolutionResponseSchema,
  GetWorkoutHistorySessionResponseSchema,
  ListWorkoutHistoryResponseSchema,
  MuscleAnalyticsResponseSchema,
  WeeklyAnalyticsResponseSchema,
  WorkoutSessionOriginSchema,
} from "./index.js";

// Athlete: Sharing Consent
export const GetAthleteProgressSharingResponseSchema = z.object({
  hasActiveCoach: z.boolean(),
  coach: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      image: z.string().nullable(),
    })
    .nullable(),
  sharingConsent: z
    .object({
      enabled: z.boolean(),
      includePreviousHistory: z.boolean(),
      sharedAt: z.string().nullable(),
      revokedAt: z.string().nullable(),
    })
    .nullable(),
});

export const UpdateAthleteProgressSharingBodySchema = z.object({
  enabled: z.boolean(),
  includePreviousHistory: z.boolean(),
});

// Coach: Progress Overview
export const CoachAthleteProgressOverviewParamsSchema = z.object({
  athleteId: z.string(),
});

export const CoachAthleteProgressOverviewQuerySchema = z.object({
  tz: z.string().default("UTC"),
  weeksCount: z.coerce.number().int().min(1).max(52).default(4).optional(),
});

export const CoachAthleteProgressOverviewResponseSchema = z.object({
  athlete: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
  }),
  range: z.object({
    weeksCount: z.number(),
    startDate: z.string(),
    endDate: z.string(),
  }),
  weekly: WeeklyAnalyticsResponseSchema,
  muscles: MuscleAnalyticsResponseSchema,
  summary: z.object({
    totalWorkouts: z.number(),
    weeklyFrequency: z.number(),
    totalWorkingSets: z.number(),
    totalLoadVolumeKg: z.number(),
    averageDurationInSeconds: z.number(),
  }),
});

// Coach: Progress Sessions
export const CoachAthleteProgressSessionsParamsSchema = z.object({
  athleteId: z.string(),
});

export const CoachAthleteProgressSessionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(15).optional(),
  origin: WorkoutSessionOriginSchema.optional(),
});

export const CoachAthleteProgressSessionsResponseSchema = ListWorkoutHistoryResponseSchema;

// Coach: Progress Session Detail
export const CoachAthleteProgressSessionParamsSchema = z.object({
  athleteId: z.string(),
  sessionId: z.string(),
});

export const CoachAthleteProgressSessionResponseSchema = GetWorkoutHistorySessionResponseSchema;

// Coach: Progress Exercises List
export const CoachAthleteProgressExercisesParamsSchema = z.object({
  athleteId: z.string(),
});

export const CoachAthleteProgressExercisesQuerySchema = z.object({
  q: z.string().optional(),
  onlyWithHistory: z.enum(["true", "false"]).optional(),
});

export const CoachAthleteProgressExercisesResponseSchema = z.array(ExerciseResponseSchema);

// Coach: Progress Exercise Evolution
export const CoachAthleteProgressExerciseEvolutionParamsSchema = z.object({
  athleteId: z.string(),
  exerciseId: z.string(),
});

export const CoachAthleteProgressExerciseEvolutionQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20).optional(),
});

export const CoachAthleteProgressExerciseEvolutionResponseSchema = GetExerciseEvolutionResponseSchema;

// Coach: Progress AI Insights
export const CoachAthleteProgressInsightsParamsSchema = z.object({
  athleteId: z.string(),
});

export const CoachAthleteProgressInsightsQuerySchema = z.object({
  tz: z.string().default("UTC"),
  weeksCount: z.coerce.number().int().min(1).max(52).default(4).optional(),
});

export const CoachAthleteProgressInsightsResponseSchema = z.object({
  athleteId: z.string(),
  athleteName: z.string(),
  periodWeeks: z.number(),
  summary: z.string(),
  consistencyAssessment: z.string(),
  highlights: z.array(z.string()),
  warnings: z.array(z.string()),
  muscleBalanceInsights: z.array(
    z.object({
      muscleGroup: z.string(),
      status: z.enum(["BALANCED", "OVERTRAINED", "UNDERTRAINED", "ATTENTION"]),
      observation: z.string(),
    })
  ),
  recommendations: z.array(z.string()),
  suggestedFocusForNextPrescription: z.string(),
  generatedAt: z.string(),
});
