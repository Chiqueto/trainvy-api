import type { MuscleGroup } from "../generated/prisma/enums.js";
import { GLOBAL_EXERCISE_ALIASES } from "./exercise-catalog-aliases.js";
import { REVIEWED_EXERCISES } from "./exercise-catalog-review.js";
import { RETIRED_GLOBAL_EXERCISES } from "./retired-global-exercises.js";

export interface CanonicalGlobalExerciseDefinition {
  id: string;
  name: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  isUnilateral?: boolean;
}

// Preserve retained bootstrap IDs; duplicate IDs are merged by the targeted migration.
export const CANONICAL_GLOBAL_CATALOG: readonly CanonicalGlobalExerciseDefinition[] =
  REVIEWED_EXERCISES.filter((e) =>
    !RETIRED_GLOBAL_EXERCISES.has(e.id) && /^00000000-0000-4000-8000-0000000001(?:0[1-9]|[1-4][0-9]|5[0-3])$/.test(
      e.id,
    ),
  ).map(({ id, name, primary, secondary }) => ({
    id,
    name,
    primary,
    secondary,
    ...(id === "00000000-0000-4000-8000-000000000138" ? { isUnilateral: true } : {}),
  }));
export const CANONICAL_GLOBAL_BY_NAME = new Map(
  CANONICAL_GLOBAL_CATALOG.map((e) => [e.name.trim().toLowerCase(), e]),
);
export const CANONICAL_GLOBAL_BY_ID = new Map(
  CANONICAL_GLOBAL_CATALOG.map((e) => [e.id, e]),
);
export function getCanonicalGlobalByName(name: string) {
  const key = name.trim().toLowerCase();
  return CANONICAL_GLOBAL_BY_NAME.get(key) ?? CANONICAL_GLOBAL_BY_ID.get(GLOBAL_EXERCISE_ALIASES.get(key) ?? "");
}
export function getCanonicalGlobalById(id: string) {
  return CANONICAL_GLOBAL_BY_ID.get(id);
}
