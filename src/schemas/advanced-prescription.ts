import z from "zod";

export const advancedPrescriptionShape = {
  repsMin: z.number().int().min(1).max(10000).nullable().optional(),
  repsMax: z.number().int().min(1).max(10000).nullable().optional(),
  targetRir: z.number().int().min(0).max(10).nullable().optional(),
  targetLoadInGrams: z.number().int().min(0).max(2000000).nullable().optional(),
  tempo: z.string().trim().min(1).max(80).nullable().optional(),
};
export function validateRepetitionRange(
  value: { repsMin?: number | null; repsMax?: number | null },
  ctx: z.RefinementCtx,
) {
  const min = value.repsMin ?? null,
    max = value.repsMax ?? null;
  if (
    (min === null) !== (max === null) ||
    (min !== null && max !== null && min > max)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["repsMax"],
      message:
        "Informe os dois limites da faixa de repetições, com mínimo menor ou igual ao máximo.",
    });
  }
}
export const AdvancedPrescriptionSchema = z
  .object(advancedPrescriptionShape)
  .superRefine(validateRepetitionRange);
export type AdvancedPrescription = z.input<typeof AdvancedPrescriptionSchema>;

export function advancedPrescription(value: AdvancedPrescription) {
  const parsed = AdvancedPrescriptionSchema.parse(value);
  return {
    repsMin: parsed.repsMin ?? null,
    repsMax: parsed.repsMax ?? null,
    targetRir: parsed.targetRir ?? null,
    targetLoadInGrams: parsed.targetLoadInGrams ?? null,
    tempo: parsed.tempo ?? null,
  };
}
export const plannedAdvancedPrescriptionShape = {
  plannedRepsMin: advancedPrescriptionShape.repsMin,
  plannedRepsMax: advancedPrescriptionShape.repsMax,
  plannedTargetRir: advancedPrescriptionShape.targetRir,
  plannedTargetLoadInGrams: advancedPrescriptionShape.targetLoadInGrams,
  plannedTempo: advancedPrescriptionShape.tempo,
};
export function plannedAdvancedPrescription(value: {
  plannedRepsMin?: number | null;
  plannedRepsMax?: number | null;
  plannedTargetRir?: number | null;
  plannedTargetLoadInGrams?: number | null;
  plannedTempo?: string | null;
}) {
  return {
    plannedRepsMin: value.plannedRepsMin ?? null,
    plannedRepsMax: value.plannedRepsMax ?? null,
    plannedTargetRir: value.plannedTargetRir ?? null,
    plannedTargetLoadInGrams: value.plannedTargetLoadInGrams ?? null,
    plannedTempo: value.plannedTempo ?? null,
  };
}

export function snapshotAdvancedPrescription(value: AdvancedPrescription) {
  const p = advancedPrescription(value);
  return {
    plannedRepsMin: p.repsMin,
    plannedRepsMax: p.repsMax,
    plannedTargetRir: p.targetRir,
    plannedTargetLoadInGrams: p.targetLoadInGrams,
    plannedTempo: p.tempo,
  };
}
