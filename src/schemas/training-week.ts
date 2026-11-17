import { z } from "zod";

import { MuscleGroupSchema } from "./index.js";

const count = z.number().int().nonnegative();
export const CurrentTrainingWeekQuerySchema = z.object({ tz: z.string() });
export const CurrentTrainingWeekResponseSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  timezone: z.string(),
  workoutsCompleted: count,
  workingSets: count,
  loadVolumeKg: z.number().nonnegative(),
  durationInSeconds: count,
  unclassifiedWorkingSets: count,
  attributes: z.object({
    shortReps: count,
    mediumReps: count,
    longReps: count,
    withoutReps: count,
  }),
  days: z.array(z.object({ date: z.string(), workoutsCompleted: count })),
  muscles: z.array(
    z.object({
      muscleGroup: MuscleGroupSchema,
      directWorkingSets: count,
      indirectWorkingSets: count,
      directLoadVolumeKg: z.number().nonnegative(),
    }),
  ),
});
