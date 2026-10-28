import type { MuscleGroup } from "../generated/prisma/enums.js";
import { REVIEWED_EXERCISES } from "./exercise-catalog-review.js";

export interface CanonicalGlobalExerciseDefinition {
  id: string;
  name: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
}

// Preserve the original bootstrap's 53 stable IDs. Expansion remains an explicit import.
export const CANONICAL_GLOBAL_CATALOG: readonly CanonicalGlobalExerciseDefinition[] =
  REVIEWED_EXERCISES.filter((e) =>
    /^00000000-0000-4000-8000-0000000001(?:0[1-9]|[1-4][0-9]|5[0-3])$/.test(
      e.id,
    ),
  ).map(({ id, name, primary, secondary }) => ({
    id,
    name,
    primary,
    secondary,
  }));
export const CANONICAL_GLOBAL_BY_NAME = new Map(
  CANONICAL_GLOBAL_CATALOG.map((e) => [e.name.trim().toLowerCase(), e]),
);
export const CANONICAL_GLOBAL_BY_ID = new Map(
  CANONICAL_GLOBAL_CATALOG.map((e) => [e.id, e]),
);
export function getCanonicalGlobalByName(name: string) {
  return CANONICAL_GLOBAL_BY_NAME.get(name.trim().toLowerCase());
}
export function getCanonicalGlobalById(id: string) {
  return CANONICAL_GLOBAL_BY_ID.get(id);
}
