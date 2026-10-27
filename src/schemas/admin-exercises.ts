import z from "zod";

import { MuscleGroup, MuscleRole } from "../generated/prisma/enums.js";

export const AdminExerciseCatalog = z.array(z.object({
  id: z.uuid(), name: z.string(), isUnilateral: z.boolean(),
  family: z.string().nullable(), updatedAt: z.string(),
  priority3d: z.object({
    exerciseId: z.uuid(), exerciseName: z.string(),
    tier: z.number().int().min(1).max(5), order: z.number().int().positive(),
    batch: z.string(), reason: z.string(),
  }).nullable(),
  muscles: z.array(z.object({ muscleGroup: z.enum(MuscleGroup), role: z.enum(MuscleRole) })),
  media: z.array(z.object({
    mediaType: z.string(), hasImages: z.boolean(), hasMotion: z.boolean(),
    hasInstructions: z.boolean(),
  })),
}));
