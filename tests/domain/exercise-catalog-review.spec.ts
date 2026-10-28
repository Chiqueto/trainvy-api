import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CatalogReviewEntry,
  REVIEWED_EXERCISES,
  REVIEWED_EXERCISES_BY_ID,
} from "../../src/domain/exercise-catalog-review.js";
import expansion from "../../src/domain/exercise-catalog-expansion.json" with { type: "json" };
import priorities from "../../src/domain/exercise-3d-priority.json" with { type: "json" };
import { CANONICAL_GLOBAL_CATALOG } from "../../src/domain/canonical-catalog.js";

const byName = (name: string) =>
  REVIEWED_EXERCISES.find((e) => e.name.split(" — ")[0] === name)!;
describe("Reviewed catalog coverage and biomechanics", () => {
  it("keeps the initial data migration aligned with all reviewed IDs and roles", () => {
    const sql = readFileSync(
      new URL(
        "../../prisma/migrations/20261028121000_review_global_exercise_muscles/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const literal = /FROM jsonb_array_elements\('(.+)'::jsonb\) d;/.exec(
      sql,
    )?.[1];
    expect(literal).toBeTruthy();
    expect(JSON.parse(literal!.replaceAll("''", "'"))).toEqual(
      JSON.parse(readFileSync(new URL("../fixtures/exercise-catalog-review-initial.json", import.meta.url), "utf8")),
    );
  });
  it("covers all 266 IDs without aliases or missing classifications", () => {
    expect(REVIEWED_EXERCISES).toHaveLength(266);
    expect(CANONICAL_GLOBAL_CATALOG).toHaveLength(53);
    for (const exercise of [...CANONICAL_GLOBAL_CATALOG, ...expansion]) {
      expect(REVIEWED_EXERCISES_BY_ID.get(exercise.id)?.name).toBe(
        exercise.name,
      );
    }
    expect([...REVIEWED_EXERCISES_BY_ID.keys()].sort()).toEqual(
      priorities.map((p) => p.exerciseId).sort(),
    );
    for (const exercise of REVIEWED_EXERCISES)
      expect(() => CatalogReviewEntry.parse(exercise)).not.toThrow();
  });
  it("distinguishes hip flexors from abductors and dorsiflexion from calves", () => {
    const legRaise = byName("Elevação de Pernas Suspenso");
    expect(legRaise.primary).toContain("HIP_FLEXORS");
    expect(legRaise.primary).not.toContain("HIP_ABDUCTORS");
    expect(byName("Elevação de Tibial Anterior").primary).toEqual([
      "TIBIALIS_ANTERIOR",
    ]);
    expect(byName("Panturrilha Sentado").primary).toEqual(["CALVES"]);
    expect(byName("Face Pull no Cabo").secondary).toContain("BICEPS");
    expect(byName("Face Pull no Cabo").secondary).not.toContain("TRICEPS");
  });
  it("does not label every landmine, LPO accessory or kettlebell as explosive", () => {
    for (const name of [
      "Agachamento no Landmine",
      "Clean Deadlift",
      "Jerk Dip",
      "Turkish Get-up",
      "Drop Landing",
    ])
      expect(byName(name).groups).not.toContain("POWER");
    for (const name of [
      "Push Press Unilateral no Landmine",
      "Power Clean",
      "Sprint",
      "Depth Jump",
    ])
      expect(byName(name).groups).toContain("POWER");
    expect(byName("Depth Jump").groups).toContain("PLYOMETRICS");
  });
});
