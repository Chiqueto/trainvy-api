import z from "zod";

export const BuilderModeSchema = z.enum(["tactical", "classic"]);
export const RuneSchema = z.enum([
  "DROP_SET",
  "REST_PAUSE",
  "ISOMETRIC_HOLD",
  "CLUSTER_SET",
  "TEMPO_CONTROL",
]);
export const TacticalSetSchema = z
  .object({
    reps: z.number().int().min(1).max(10000),
    zone: z.enum(["strength", "hypertrophy", "endurance"]),
    restSeconds: z.number().int().min(1).max(86400),
    load: z.number().min(0).max(2000).optional(),
  })
  .strict();
export const tacticalPrescriptionShape = {
  runeConfig: z
    .object({
      DROP_SET: z.number().int().min(1).max(10).optional(),
      REST_PAUSE: z.number().int().min(1).max(600).optional(),
      // Keep the persisted peak2/base2 notation compatible with existing plans.
      ISOMETRIC_HOLD: z
        .string()
        .regex(/^(peak|base)([1-9]|[1-9]\d|[1-5]\d\d|600)$/)
        .optional(),
      CLUSTER_SET: z.number().int().min(2).max(20).optional(),
      TEMPO_CONTROL: z
        .string()
        .regex(
          /^(?:[0-9]|[1-5][0-9]|60)-(?:[0-9]|[1-5][0-9]|60)-(?:[0-9]|[1-5][0-9]|60)-(?:[0-9]|[1-5][0-9]|60)$/,
        )
        .optional(),
    })
    .strict()
    .optional(),
  supersetGroupId: z.string().trim().min(1).max(100).nullable().optional(),
  runes: z.array(RuneSchema).max(5).optional(),
  setPrescription: z.array(TacticalSetSchema).max(100).optional(),
};
export type TacticalPrescription = {
  runeConfig?: unknown;
  supersetGroupId?: string | null;
  runes?: string[];
  setPrescription?: unknown;
};
export function tacticalPrescription(value: TacticalPrescription) {
  const parsed = z.object(tacticalPrescriptionShape).parse(value);
  return {
    runeConfig: parsed.runeConfig ?? {},
    supersetGroupId: parsed.supersetGroupId ?? null,
    runes: parsed.runes ?? [],
    setPrescription: parsed.setPrescription ?? [],
  };
}

export type TacticalFields = z.infer<
  z.ZodObject<typeof tacticalPrescriptionShape>
>;
