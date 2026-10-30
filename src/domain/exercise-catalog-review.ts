import { createHash } from "node:crypto";

import z from "zod";

import { MuscleGroup } from "../generated/prisma/enums.js";
import definitions from "./exercise-catalog-review.json" with { type: "json" };

export const ExerciseTrainingGroup = z.enum([
  "RESISTANCE",
  "POWER",
  "PLYOMETRICS",
  "WEIGHTLIFTING",
  "CALISTHENICS",
  "CONDITIONING",
  "CORE_STABILITY",
  "CARRIES",
]);

export const CATALOG_REVIEW_VERSION = "2026-10-28.1";
export const CATALOG_REVIEW_SOURCES: Record<
  string,
  { title: string; url: string }
> = {
  "stiff-variants": { title: "Coratella et al. - Romanian and stiff-leg deadlift comparison (2022)", url: "https://doi.org/10.3390/ijerph19031903" },
  "stiff-hamstrings": { title: "Boyer et al. - Individual hamstring activation during stiff-leg deadlift (2021)", url: "https://pubmed.ncbi.nlm.nih.gov/33678131/" },
  "stiff-trunk": { title: "Iversen et al. - Conventional and elastic resistance in stiff-leg deadlift (2017)", url: "https://doi.org/10.1080/17461391.2017.1337229" },
  "horizontal-press-seated": { title: "Abelleira-Lamela et al. - Seated leg press EMG comparison (2024)", url: "https://doi.org/10.3390/app14167390" },
  "horizontal-press-quads": { title: "Guerra de Sá et al. - Horizontal leg press, including unrestricted condition (2025)", url: "https://pubmed.ncbi.nlm.nih.gov/40954655/" },
  "horizontal-press-calf": { title: "Tassi et al. - Gastrocnemius during horizontal leg press (1999)", url: "https://pubmed.ncbi.nlm.nih.gov/10499208/" },
  "leg-press-emg": { title: "Da Silva et al. - Leg press muscle activation (2008)", url: "https://pubmed.ncbi.nlm.nih.gov/18545207/" },
  "leg-press-kinematics": { title: "Martín-Fuentes et al. - Inclined leg press EMG and kinematics (2020)", url: "https://doi.org/10.3390/ijerph17228698" },
  "leg-press-2026": { title: "Kinoshita et al. - Knee extension versus leg press (2026)", url: "https://pubmed.ncbi.nlm.nih.gov/41630124/" },
  "hack-trunk": { title: "Clark et al. - Trunk Muscle Activation in the Back and Hack Squat (2019)", url: "https://doi.org/10.1519/JSC.0000000000002144" },
  "hack-anatomy": { title: "Arnold et al. - A Model of the Lower Limb for Analysis of Human Movement (2010)", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2903973/" },
  "leg-extension-quads": {"title":"Akima et al. — Neuromuscular activation of the quadriceps femoris, including the vastus intermedius, during isokinetic knee extensions (2023)","url":"https://doi.org/10.1038/s41598-023-34532-x"},
  "leg-extension-hip": {"title":"Larsen et al. — The effects of hip flexion angle on quadriceps femoris muscle hypertrophy in the leg extension exercise (2025)","url":"https://pubmed.ncbi.nlm.nih.gov/39699974/"},
  "leg-extension-coactivation": {"title":"Co-Activation, Estimated Anterior and Posterior Cruciate Ligament Forces, and Motor Unit Activation Strategies during the Time Course of Fatigue (2018)","url":"https://pubmed.ncbi.nlm.nih.gov/30248892/"},
  press: {
    title: "Bench press and dumbbell flyes — comparative study (2020)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7675616/",
  },
  "seated-curl-hamstrings": {
    title: "Maeo et al. — seated versus prone leg curl (2021)",
    url: "https://pubmed.ncbi.nlm.nih.gov/33009197/",
  },
  "seated-curl-ankle": {
    title: "Lisboa et al. — ankle position during seated leg curl (2026)",
    url: "https://pubmed.ncbi.nlm.nih.gov/41609763/",
  },
  "seated-curl-flexors": {
    title: "Maeo et al. — knee flexors during lengthened eccentric training (2024)",
    url: "https://pubmed.ncbi.nlm.nih.gov/38857522/",
  },
  legs: {
    title: "Leg press and variants — systematic review (2020)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7369968/",
  },
  "prone-curl-hamstrings": { title: "Maeo et al. — seated versus prone leg curl (2021)", url: "https://pubmed.ncbi.nlm.nih.gov/33009197/" },
  "prone-curl-ankle": { title: "Cadeo et al. — ankle position during prone leg curl (2023)", url: "https://pubmed.ncbi.nlm.nih.gov/37194431/" },
  "prone-curl-gastrocnemius": { title: "Marchetti et al. — knee/ankle positions during prone leg curl (2021)", url: "https://pubmed.ncbi.nlm.nih.gov/31469769/" },
  "prone-curl-flexors": { title: "Maeo et al. — individual knee flexors in eccentric training (2024)", url: "https://pubmed.ncbi.nlm.nih.gov/38857522/" },
  glutes: {
    title: "Gluteus maximus in strength exercises — systematic review (2020)",
    url: "https://pubmed.ncbi.nlm.nih.gov/32132843/",
  },
  deadlift: {
    title: "Deadlift and variants — systematic review (2020)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7046193/",
  },
  "hip-flexors": {
    title: "Hip flexor activation — systematic review (2024)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11546833/",
  },
  tibial: {
    title: "Anatomy: tibialis anterior — NCBI Bookshelf",
    url: "https://www.ncbi.nlm.nih.gov/books/NBK513304/",
  },
  "face-pull": {
    title: "Posterior deltoid exercises — biomechanical modeling (2026)",
    url: "https://pubmed.ncbi.nlm.nih.gov/41964926/",
  },
  kettlebell: {
    title: "Kettlebell swing, snatch and clean — comparative EMG (2017)",
    url: "https://pubmed.ncbi.nlm.nih.gov/28394829/",
  },
  ace: {
    title: "ACE exercise library: movement references",
    url: "https://www.acefitness.org/resources/everyone/exercise-library/",
  },
  "upper-anatomy": {
    title: "Chest exercises: shoulder/elbow/wrist biomechanics (2022)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8877248/",
  },
  catalyst: {
    title: "Catalyst Athletics: Olympic weightlifting movement library",
    url: "https://www.catalystathletics.com/exercises/",
  },
  crossfit: {
    title: "CrossFit: official movement library",
    url: "https://www.crossfit.com/crossfit-movements",
  },
  landmine: {
    title: "Catalyst Athletics: landmine anti-rotation",
    url: "https://www.catalystathletics.com/exercise/504/Anti-Rotation-Landmine/",
  },
  throws: {
    title: "NSCA: tests of core muscle power",
    url: "https://dxpprod.nsca.com/education/articles/kinetic-select/tests-of-core-muscle-power/",
  },
  jumps: {
    title: "HSS: introduction to plyometrics",
    url: "https://www.hss.edu/health-library/move-better/plyometrics-workouts-for-beginner",
  },
  locomotion: {
    title: "CrossFit: monostructural movements and carries",
    url: "https://www.crossfit.com/crossfit-movements",
  },
};

export const CatalogReviewEntry = z
  .object({
    id: z.uuid(),
    name: z.string().min(1),
    family: z.string().min(1),
    groups: z.array(ExerciseTrainingGroup).min(1),
    primary: z.array(z.enum(MuscleGroup)).min(1),
    secondary: z.array(z.enum(MuscleGroup)),
    sourceIds: z
      .array(z.string().refine((id) => !!CATALOG_REVIEW_SOURCES[id]))
      .min(1),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    for (const key of ["primary", "secondary", "groups"] as const) {
      if (new Set(entry[key]).size !== entry[key].length)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Duplicate classification",
        });
    }
    if (entry.primary.some((m) => entry.secondary.includes(m)))
      ctx.addIssue({
        code: "custom",
        path: ["secondary"],
        message: "Primary/secondary overlap",
      });
  });
export type ReviewedExercise = z.infer<typeof CatalogReviewEntry>;
export const REVIEWED_EXERCISES = z
  .array(CatalogReviewEntry)
  .parse(definitions);
if (
  new Set(REVIEWED_EXERCISES.map((e) => e.id)).size !==
  REVIEWED_EXERCISES.length
)
  throw new Error("Duplicate reviewed exercise IDs");
export const REVIEWED_EXERCISES_BY_ID = new Map(
  REVIEWED_EXERCISES.map((e) => [e.id, e]),
);

export type CatalogSnapshot = {
  id: string;
  name: string;
  updatedAt: Date;
  muscles: { muscleGroup: string; role: string }[];
}[];
export function catalogFingerprint(rows: CatalogSnapshot) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [...rows]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((e) => ({
            id: e.id,
            name: e.name,
            updatedAt: e.updatedAt.toISOString(),
            muscles: e.muscles.map((m) => `${m.role}:${m.muscleGroup}`).sort(),
          })),
      ),
    )
    .digest("hex");
}
export function muscleSignature(
  muscles: { muscleGroup: string; role: string }[],
) {
  return muscles
    .map((m) => `${m.role}:${m.muscleGroup}`)
    .sort()
    .join("|");
}
export function reviewedMuscles(
  e: Pick<ReviewedExercise, "primary" | "secondary">,
) {
  return [
    ...e.primary.map((muscleGroup) => ({
      muscleGroup,
      role: "PRIMARY" as const,
    })),
    ...e.secondary.map((muscleGroup) => ({
      muscleGroup,
      role: "SECONDARY" as const,
    })),
  ];
}
