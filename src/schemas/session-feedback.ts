import z from "zod";
const rating = z.number().int().min(0).max(10).nullable();
export const SessionFeedbackBody = z.object({
  feeling: z.enum(["great", "energized", "intense", "fatigued"]),
  pain: rating.optional(),
  fatigue: rating.optional(),
  sleepQuality: rating.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict();
export const SessionFeedbackResponse = z.object({
  workoutSessionId: z.uuid(),
  feeling: z.enum(["great", "energized", "intense", "fatigued"]),
  pain: rating,
  fatigue: rating,
  sleepQuality: rating,
  notes: z.string().nullable(),
  updatedAt: z.string(),
});
