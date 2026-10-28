import z from "zod";
import { ExerciseAnatomySchema } from "../domain/exercise-anatomy.js";

import { ExerciseTrainingGroup } from "../domain/exercise-catalog-review.js";
import { MuscleGroup, MuscleRole } from "../generated/prisma/enums.js";

export const AdminExerciseMusclesBody = z
  .object({
    expectedUpdatedAt: z.iso.datetime(),
    primaryMuscleGroups: z.array(z.enum(MuscleGroup)).min(1).max(15),
    secondaryMuscleGroups: z.array(z.enum(MuscleGroup)).max(15),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (
      new Set(body.primaryMuscleGroups).size !==
        body.primaryMuscleGroups.length ||
      new Set(body.secondaryMuscleGroups).size !==
        body.secondaryMuscleGroups.length ||
      body.primaryMuscleGroups.some((m) =>
        body.secondaryMuscleGroups.includes(m),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Muscle groups must be unique and disjoint",
      });
    }
  });
export const AdminExerciseMusclesResult = z.object({
  id: z.uuid(),
  updatedAt: z.iso.datetime(),
  muscles: z.array(
    z.object({ muscleGroup: z.enum(MuscleGroup), role: z.enum(MuscleRole) }),
  ),
});

export const AdminExerciseCatalog = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    isUnilateral: z.boolean(),
    family: z.string().nullable(),
    updatedAt: z.string(),
    groups: z.array(ExerciseTrainingGroup),
    anatomy: ExerciseAnatomySchema.nullable().optional(),
    review: z
      .object({
        version: z.string(),
        matches: z.boolean(),
        notes: z.string().nullable(),
        sources: z.array(z.object({ title: z.string(), url: z.url() })),
      })
      .nullable(),
    priority3d: z
      .object({
        exerciseId: z.uuid(),
        exerciseName: z.string(),
        tier: z.number().int().min(1).max(5),
        order: z.number().int().positive(),
        batch: z.string(),
        reason: z.string(),
      })
      .nullable(),
    muscles: z.array(
      z.object({ muscleGroup: z.enum(MuscleGroup), role: z.enum(MuscleRole) }),
    ),
    media: z.array(
      z.object({
        mediaType: z.string(),
        hasImages: z.boolean(),
        hasMotion: z.boolean(),
        hasInstructions: z.boolean(),
      }),
    ),
  }),
);
