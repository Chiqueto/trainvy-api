import z from "zod";

import { MuscleGroup, MuscleRole } from "../generated/prisma/enums.js";

export const AdminExerciseCatalog = z.array(z.object({
  id: z.uuid(), name: z.string(), isUnilateral: z.boolean(),
  family: z.string().nullable(), updatedAt: z.string(),
  muscles: z.array(z.object({ muscleGroup: z.enum(MuscleGroup), role: z.enum(MuscleRole) })),
  media: z.array(z.object({
    mediaType: z.string(), hasImages: z.boolean(), hasMotion: z.boolean(),
    hasInstructions: z.boolean(),
  })),
}));
