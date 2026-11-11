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
      DROP_SET: z.number().int().min(1).max(3).optional(),
      REST_PAUSE: z
        .union([z.literal(10), z.literal(15), z.literal(20)])
        .optional(),
      ISOMETRIC_HOLD: z.enum(["peak2", "peak3", "base2"]).optional(),
      CLUSTER_SET: z
        .union([z.literal(2), z.literal(3), z.literal(4)])
        .optional(),
      TEMPO_CONTROL: z.enum(["3-0-1-0", "4-0-1-0", "3-1-1-0"]).optional(),
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
