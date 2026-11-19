import z from "zod";

// Keys of the existing Trainvy 3D library. No model is inferred from a name.
export const AnimationKeySchema = z.enum([
  "military-press",
  "dumbbell-shoulder-press",
  "lateral-raise",
  "barbell-curl",
  "legacy-barbell-curl",
  "hammer-curl",
  "rope-pushdown",
  "skull-crusher",
  "straight-bar-pushdown",
  "decline-dumbbell-press",
  "incline-smith-press",
  "decline-smith-press",
  "preacher-curl",
  "high-supinated-bent-row",
  "yates-row",
  "supinated-yates-row",
  "pendlay-row",
  "supinated-bent-row",
  "high-bent-row",
  "one-arm-row",
  "generic-bent-row",
  "bent-row",
  "machine-row",
  "cable-row",
  "front-lat-pulldown",
  "lat-pulldown",
  "hang-power-clean",
  "squat",
  "bench-press",
  "incline-dumbbell-press",
  "flat-dumbbell-press",
  "incline-bench-press",
  "decline-bench-press",
  "pec-deck",
  "machine-fly",
  "flat-dumbbell-fly",
  "smith-bench-press",
  "machine-chest-press",
  "smith-squat",
  "leg-extension",
  "seated-leg-curl",
  "prone-leg-curl",
  "hack-squat",
  "leg-press-45",
  "horizontal-leg-press",
  "stiff",
  "deadlift",
  "sumo-deadlift",
  "seated-calf",
  "standing-calf",
  "hip-thrust",
  "hip-abduction",
  "goblet-squat",
  "sumo-dumbbell-squat",
]);

export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === "youtu.be")
      id = url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1] ?? null;
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
      id =
        url.pathname === "/watch"
          ? url.searchParams.get("v")
          : (url.pathname.match(
              /^\/(?:shorts|embed|live)\/([\w-]{11})\/?$/,
            )?.[1] ?? null);
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export const ExerciseDemonstrationSchema = z.object({
  youtubeUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(
      (value) => youtubeVideoId(value) !== null,
      "Informe uma URL HTTPS válida de um vídeo do YouTube.",
    )
    .transform(
      (value) => `https://www.youtube.com/watch?v=${youtubeVideoId(value)}`,
    )
    .pipe(z.string().url())
    .nullable(),
  animationKey: AnimationKeySchema.nullable(),
});

export type ExerciseDemonstrationInput = z.input<
  typeof ExerciseDemonstrationSchema
>;
