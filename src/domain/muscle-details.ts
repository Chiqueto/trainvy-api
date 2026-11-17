import z from "zod";
import { MuscleGroup, MuscleRole } from "../generated/prisma/enums.js";
import options from "./muscle-detail-options.json" with { type: "json" };
import { ValidationError } from "../errors/index.js";

// Identifiers and labels mirror the catalog anatomy reviews. These are user
// classifications, not scientific reviews or measured activation.
export const MuscleDetailsSchema = z
  .array(
    z
      .object({
        muscleGroup: z.enum(MuscleGroup),
        role: z.enum(MuscleRole),
        detailIds: z.array(z.string().min(1).max(80)).max(30),
      })
      .strict(),
  )
  .max(15)
  .superRefine((details, ctx) => {
    if (new Set(details.map((d) => d.muscleGroup)).size !== details.length)
      ctx.addIssue({ code: "custom", message: "Duplicate muscle groups" });
    for (const d of details) {
      if (
        new Set(d.detailIds).size !== d.detailIds.length ||
        d.detailIds.some(
          (id) => !options[d.muscleGroup].some((o) => o.id === id),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid muscle detail for group",
        });
    }
  });
export type MuscleDetails = z.infer<typeof MuscleDetailsSchema>;

export function readMuscleDetails(
  value: unknown,
  muscles: { muscleGroup: string; role: string }[],
): MuscleDetails {
  const result = MuscleDetailsSchema.safeParse(value);
  return result.success
    ? result.data.filter((d) =>
        muscles.some(
          (m) => m.muscleGroup === d.muscleGroup && m.role === d.role,
        ),
      )
    : [];
}

export function validateMuscleDetails(
  value: unknown,
  primary: string[],
  secondary: string[],
): MuscleDetails {
  const parsed = MuscleDetailsSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.some(
      (d) =>
        !(d.role === "PRIMARY" ? primary : secondary).includes(d.muscleGroup),
    )
  )
    throw new ValidationError(
      "Detalhes musculares devem pertencer aos grupos e papéis selecionados.",
    );
  return parsed.data;
}
