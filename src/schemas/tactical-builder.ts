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
  supersetGroupId: z.string().trim().min(1).max(100).nullable().optional(),
  runes: z.array(RuneSchema).max(5).optional(),
  setPrescription: z.array(TacticalSetSchema).max(100).optional(),
};
export type TacticalPrescription = {
  supersetGroupId?: string | null;
  runes?: string[];
  setPrescription?: unknown;
};
export function tacticalPrescription(value: TacticalPrescription) {
  const parsed = z.object(tacticalPrescriptionShape).parse(value);
  return {
    supersetGroupId: parsed.supersetGroupId ?? null,
    runes: parsed.runes ?? [],
    setPrescription: parsed.setPrescription ?? [],
  };
}

export type TacticalFields = z.infer<
  z.ZodObject<typeof tacticalPrescriptionShape>
>;
