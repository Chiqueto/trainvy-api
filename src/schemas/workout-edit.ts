import z from "zod";
import { WorkoutDaySchema, WorkoutExerciseSchema } from "./index.js";

export const EditableWorkoutExercise = WorkoutExerciseSchema.extend({
  id: z.uuid().optional(),
  order: z.number().int().min(0),
  sets: z.number().int().min(1).max(100),
  reps: z.number().int().min(1).max(10000),
  restTimeInSeconds: z.number().int().min(1).max(86400),
});
export const EditableWorkoutDay = WorkoutDaySchema.safeExtend({
  id: z.uuid().optional(),
  exercises: z.array(EditableWorkoutExercise).max(100),
});
export const UpdateWorkoutPlanBody = z.object({
  name: z.string().trim().min(1).max(120),
  workoutDays: z.array(EditableWorkoutDay).min(1).max(50),
}).strict();
export const EditableWorkoutPlanResponse = UpdateWorkoutPlanBody.extend({
  id: z.uuid(),
  isActive: z.boolean(),
});
