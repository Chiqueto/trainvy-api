import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  anatomySearchTerms,
  ExerciseAnatomySchema,
  getExerciseAnatomy,
} from "../../src/domain/exercise-anatomy.js";
import { REVIEWED_EXERCISES_BY_ID } from "../../src/domain/exercise-catalog-review.js";

const id = "9e9f7973-098d-432d-8745-ee8c126fe576";
const review = ExerciseAnatomySchema.parse(
  JSON.parse(
    readFileSync(
      new URL("../../src/domain/goblet-squat-anatomy.json", import.meta.url),
      "utf8",
    ),
  ),
);
const muscles = [
  { muscleGroup: "QUADRICEPS", role: "PRIMARY" },
  { muscleGroup: "GLUTES", role: "PRIMARY" },
  { muscleGroup: "ADDUCTORS", role: "SECONDARY" },
  { muscleGroup: "CORE", role: "SECONDARY" },
  { muscleGroup: "BACK", role: "SECONDARY" },
  { muscleGroup: "SHOULDERS", role: "SECONDARY" },
  { muscleGroup: "BICEPS", role: "SECONDARY" },
  { muscleGroup: "FOREARMS", role: "SECONDARY" },
  { muscleGroup: "HAMSTRINGS", role: "SECONDARY" },
] as const;
const sql = readFileSync(
  new URL(
    "../../prisma/migrations/20261103190000_goblet_contact_k602/migration.sql",
    import.meta.url,
  ),
  "utf8",
)
  .replace(/^BEGIN;\s*$/m, "")
  .replace(/^COMMIT;\s*$/m, "");

describe("goblet squat anatomical review", () => {
  it("aligns the detailed anatomy, broad groups, named search terms and delivered migration", () => {
    const entry = REVIEWED_EXERCISES_BY_ID.get(id)!;
    expect(entry.primary).toEqual(["QUADRICEPS", "GLUTES"]);
    expect(entry.secondary).toEqual([
      "ADDUCTORS",
      "CORE",
      "BACK",
      "SHOULDERS",
      "BICEPS",
      "FOREARMS",
      "HAMSTRINGS",
    ]);
    expect(getExerciseAnatomy(review, [...muscles])).toEqual(review);
    expect(getExerciseAnatomy(review, muscles.slice(0, 1))).toBeNull();
    expect(
      review.participants.filter((p) => p.role === "PRIMARY"),
    ).toHaveLength(5);
    expect(anatomySearchTerms(review)).toEqual(
      expect.arrayContaining([
        "Reto femoral",
        "Vasto lateral",
        "Vasto medial",
        "Vasto intermédio",
        "Glúteo máximo",
        "Adutor magno",
        "Reto abdominal",
        "Oblíquo externo",
        "Eretores da coluna",
        "Deltoide anterior",
        "Bíceps braquial",
        "Flexores do antebraço",
      ]),
    );
    expect(
      JSON.parse(
        /SET "anatomyReview"='(.+?)'::jsonb/.exec(sql)![1].replaceAll("''", "'"),
      ),
    ).toEqual(review);
  });

  it("validates instructions and setup are present and detailed", () => {
    expect(review.instructions.setup).toContain("halter");
    expect(review.instructions.execution).toContain("quadris e joelhos");
    expect(review.instructions.tips).toContain("esterno");
  });
});
