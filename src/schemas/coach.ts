import z from "zod";

export const CreateCoachInvitationBodySchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).optional().default(7),
});

export const CreateCoachInvitationResponseSchema = z.object({
  id: z.string(),
  token: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export const CoachInvitationItemSchema = z.object({
  id: z.string(),
  status: z.enum(["PENDING", "ACCEPTED", "CANCELLED", "EXPIRED"]),
  expiresAt: z.string(),
  createdAt: z.string(),
  acceptedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
});

export const ListCoachInvitationsResponseSchema = z.array(CoachInvitationItemSchema);

export const CancelCoachInvitationParamsSchema = z.object({
  id: z.string(),
});

export const CoachAthleteItemSchema = z.object({
  linkId: z.string(),
  athleteId: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  acceptedAt: z.string(),
  evolutionShared: z.boolean().default(false),
  lastWorkoutSessionAt: z.string().nullable().optional(),
  workoutsThisWeekCount: z.number().int().default(0),
  hasActiveWorkoutPlan: z.boolean().default(false),
  activeWorkoutPlanName: z.string().nullable().optional(),
  pendingPrescriptionsCount: z.number().int().default(0),
  activePrescription: z
    .object({
      id: z.string(),
      status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "CANCELLED"]),
      name: z.string(),
      updatedAt: z.string(),
    })
    .nullable()
    .optional(),
});

export const CoachAthletesSummarySchema = z.object({
  totalAthletes: z.number().int(),
  activeThisWeekCount: z.number().int(),
  atRiskCount: z.number().int(),
  pendingPrescriptionsCount: z.number().int(),
  withoutPlanCount: z.number().int(),
});

export const ListCoachAthletesResponseSchema = z.object({
  athletes: z.array(CoachAthleteItemSchema),
  activeCount: z.number().int(),
  limit: z.number().int().nullable(),
  summary: CoachAthletesSummarySchema.optional(),
});

export const GetCoachAthleteParamsSchema = z.object({
  athleteId: z.string(),
});

export const GetCoachAthleteDetailsResponseSchema = z.object({
  linkId: z.string(),
  athleteId: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  acceptedAt: z.string(),
  status: z.string(),
});

export const RevokeCoachAthleteParamsSchema = z.object({
  linkId: z.string(),
});

export const GetInvitationPreviewParamsSchema = z.object({
  token: z.string().min(8),
});

export const InvitationPreviewCoachSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

export const GetInvitationPreviewResponseSchema = z.object({
  isValid: z.boolean(),
  reason: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  coach: InvitationPreviewCoachSchema.nullable(),
  expiresAt: z.string().nullable(),
});

export const AcceptCoachInvitationBodySchema = z.object({
  token: z.string().min(8),
});

export const AcceptCoachInvitationResponseSchema = z.object({
  success: z.boolean(),
  link: z.object({
    id: z.string(),
    coachId: z.string(),
    athleteId: z.string(),
    status: z.string(),
    createdAt: z.string(),
  }),
  coach: InvitationPreviewCoachSchema,
});

export const AthleteCoachRelationshipDetailsSchema = z.object({
  linkId: z.string(),
  coachId: z.string(),
  coachName: z.string(),
  coachEmail: z.string(),
  coachImage: z.string().nullable(),
  acceptedAt: z.string(),
});

export const GetAthleteCoachRelationshipResponseSchema = z.object({
  hasCoach: z.boolean(),
  relationship: AthleteCoachRelationshipDetailsSchema.nullable(),
});

export const SuccessResponseSchema = z.object({
  success: z.boolean(),
});
