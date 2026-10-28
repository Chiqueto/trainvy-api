import z from "zod";
import { MuscleGroup, MuscleRole } from "../generated/prisma/enums.js";

const identifier = z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/);
const words = z.array(z.string().trim().min(1).max(160)).max(30);
export const ExerciseAnatomySchema = z
  .object({
    version: z.string().min(1).max(40),
    reviewedAt: z.iso.datetime(),
    variant: z.string().min(1).max(200),
    aliases: words,
    participants: z
      .array(
        z
          .object({
            id: identifier,
            label: z.string().min(1).max(160),
            muscleGroup: z.enum(MuscleGroup),
            role: z.enum(MuscleRole),
            aliases: words,
            regions: z
              .array(
                z
                  .object({
                    id: identifier,
                    label: z.string().min(1).max(160),
                    aliases: words,
                  })
                  .strict(),
              )
              .max(12),
            emphasizedRegionIds: z.array(identifier).max(12),
            sourceIds: z.array(identifier).min(1).max(12),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    sources: z
      .array(
        z
          .object({
            id: identifier,
            title: z.string().min(1).max(300),
            url: z.url(),
            limitation: z.string().max(1200),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    notes: z.string().min(1).max(3000),
    instructions: z
      .object({
        description: z.string().min(1),
        setup: z.string().min(1),
        execution: z.string().min(1),
        tips: z.string().min(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((review, ctx) => {
    const sourceIds = new Set(review.sources.map((s) => s.id));
    if (
      sourceIds.size !== review.sources.length ||
      new Set(review.participants.map((p) => p.id)).size !==
        review.participants.length ||
      !review.participants.some((p) => p.role === "PRIMARY")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Unique sources/participants and a primary muscle are required",
      });
    for (const p of review.participants) {
      const regions = new Set(p.regions.map((r) => r.id));
      if (
        regions.size !== p.regions.length ||
        p.emphasizedRegionIds.some((r) => !regions.has(r)) ||
        p.sourceIds.some((id) => !sourceIds.has(id))
      )
        ctx.addIssue({
          code: "custom",
          message: "Region emphasis and sources must reference this review",
        });
    }
  })
  .meta({ id: "ExerciseAnatomyReview" });
export type ExerciseAnatomy = z.infer<typeof ExerciseAnatomySchema>;

/** A coarse classification edited later invalidates the detailed review until reconciled. */
export function getExerciseAnatomy(
  value: unknown,
  muscles: { muscleGroup: string; role: string }[],
): ExerciseAnatomy | null {
  const result = ExerciseAnatomySchema.safeParse(value);
  if (!result.success) return null;
  const pairs = new Set(
    result.data.participants.map((p) => `${p.role}:${p.muscleGroup}`),
  );
  if (
    muscles.length !== pairs.size ||
    muscles.some((m) => !pairs.has(`${m.role}:${m.muscleGroup}`))
  )
    return null;
  return result.data;
}

export function anatomySearchTerms(review: ExerciseAnatomy | null): string[] {
  return review
    ? [
        ...review.aliases,
        ...review.participants.flatMap((p) => [
          p.label,
          ...p.aliases,
          ...p.regions.flatMap((r) => [r.label, ...r.aliases]),
        ]),
      ]
    : [];
}

// Broad searches include all exercises in the parent group, including those not
// yet reviewed anatomically. A regional query only matches explicitly stored detail.
export function broadMuscleSearchTerms(
  muscles: { muscleGroup: string }[],
): string[] {
  const labels: Record<string, string[]> = {
    CHEST: ["peito", "peitoral", "peitorais"],
    BACK: ["costas"],
    SHOULDERS: ["ombro", "ombros"],
    BICEPS: ["bíceps"],
    TRICEPS: ["tríceps"],
    FOREARMS: ["antebraço", "antebraços"],
    QUADRICEPS: ["quadríceps"],
    HAMSTRINGS: ["posteriores", "isquiotibiais"],
    GLUTES: ["glúteos"],
    ADDUCTORS: ["adutores"],
    HIP_ABDUCTORS: ["abdutores"],
    CALVES: ["panturrilhas"],
    CORE: ["core", "abdômen"],
    HIP_FLEXORS: ["flexores do quadril"],
    TIBIALIS_ANTERIOR: ["tibial anterior"],
  };
  return muscles.flatMap((m) => [
    m.muscleGroup,
    ...(labels[m.muscleGroup] ?? []),
  ]);
}
