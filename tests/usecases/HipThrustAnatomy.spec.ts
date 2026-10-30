import { readFileSync } from "node:fs";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import {
  anatomySearchTerms,
  ExerciseAnatomySchema,
  getExerciseAnatomy,
} from "../../src/domain/exercise-anatomy.js";
import { REVIEWED_EXERCISES_BY_ID } from "../../src/domain/exercise-catalog-review.js";
import { getDatabaseUrl } from "../../src/lib/db.js";

const id = "00000000-0000-4000-8000-000000000114";
const review = ExerciseAnatomySchema.parse(
  JSON.parse(
    readFileSync(
      new URL("../../src/domain/hip-thrust-anatomy.json", import.meta.url),
      "utf8",
    ),
  ),
);
const muscles = [
  { muscleGroup: "GLUTES", role: "PRIMARY" },
  { muscleGroup: "HAMSTRINGS", role: "SECONDARY" },
  { muscleGroup: "ADDUCTORS", role: "SECONDARY" },
  { muscleGroup: "CORE", role: "SECONDARY" },
  { muscleGroup: "QUADRICEPS", role: "SECONDARY" },
  { muscleGroup: "HIP_ABDUCTORS", role: "SECONDARY" },
  { muscleGroup: "BACK", role: "SECONDARY" },
] as const;
const sql = readFileSync(
  new URL(
    "../../prisma/migrations/20261030210000_hip_thrust_000114_anatomy/migration.sql",
    import.meta.url,
  ),
  "utf8",
)
  .replace(/^BEGIN;\s*$/m, "")
  .replace(/^COMMIT;\s*$/m, "");

describe("hip thrust anatomical review", () => {
  it("aligns the detailed anatomy, broad groups, named search terms and delivered migration", () => {
    const entry = REVIEWED_EXERCISES_BY_ID.get(id)!;
    expect(entry.primary).toEqual(["GLUTES"]);
    expect(entry.secondary).toEqual([
      "HAMSTRINGS",
      "ADDUCTORS",
      "CORE",
      "QUADRICEPS",
      "HIP_ABDUCTORS",
      "BACK",
    ]);
    expect(getExerciseAnatomy(review, [...muscles])).toEqual(review);
    expect(getExerciseAnatomy(review, muscles.slice(0, 2))).toBeNull();
    expect(
      review.participants.filter((p) => p.role === "PRIMARY"),
    ).toHaveLength(1);
    expect(anatomySearchTerms(review)).toEqual(
      expect.arrayContaining([
        "Glúteo máximo",
        "Bíceps femoral — cabeça longa",
        "Semitendíneo",
        "Semimembranáceo",
        "Adutor magno",
        "Reto femoral",
        "Vasto lateral",
        "Vasto medial",
        "Vasto intermédio",
        "Glúteo médio",
        "Reto abdominal",
        "Oblíquo externo",
        "Eretores da coluna",
      ]),
    );
    expect(
      JSON.parse(
        /SET "anatomyReview"='(.+)'::jsonb/.exec(sql)![1].replaceAll("''", "'"),
      ),
    ).toEqual(review);
  });

  it("migrates only its UUID, invalidates cache, deduplicates broad groups and preserves existing reviews", async () => {
    const c = new Client({ connectionString: getDatabaseUrl() });
    await c.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        'INSERT INTO "Exercise" (id,name,"isUnilateral","createdAt","updatedAt") VALUES ($1,$2,false,NOW(),NOW()) ON CONFLICT (id) DO NOTHING',
        [id, "Elevação Pélvica"],
      );
      await c.query(
        'UPDATE "Exercise" SET "anatomyReview"=NULL,"updatedAt"=\'2000-01-01\' WHERE id=$1',
        [id],
      );
      await c.query('DELETE FROM "ExerciseMuscle" WHERE "exerciseId"=$1', [id]);
      await c.query(
        `INSERT INTO "ExerciseMuscle" (id,"exerciseId","muscleGroup",role,"createdAt") VALUES (gen_random_uuid()::text,$1,'GLUTES','PRIMARY',NOW()),(gen_random_uuid()::text,$1,'HAMSTRINGS','SECONDARY',NOW()),(gen_random_uuid()::text,$1,'ADDUCTORS','SECONDARY',NOW()),(gen_random_uuid()::text,$1,'CORE','SECONDARY',NOW())`,
        [id],
      );
      const identity = (
        await c.query(
          'SELECT id,name,"createdAt","ownerUserId" FROM "Exercise" WHERE id=$1',
          [id],
        )
      ).rows;
      const others = (
        await c.query(
          'SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',
          [id],
        )
      ).rows;
      await c.query(sql);
      const first = (
        await c.query(
          'SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',
          [id],
        )
      ).rows[0];
      expect(first.anatomyReview).toEqual(review);
      expect(new Date(first.updatedAt).getTime()).toBeGreaterThan(
        new Date("2000-01-01").getTime(),
      );
      expect(
        (
          await c.query(
            'SELECT "muscleGroup",role FROM "ExerciseMuscle" WHERE "exerciseId"=$1',
            [id],
          )
        ).rows,
      ).toEqual(expect.arrayContaining([...muscles]));
      expect(
        (
          await c.query(
            'SELECT count(*)::int AS count FROM "ExerciseMuscle" WHERE "exerciseId"=$1',
            [id],
          )
        ).rows[0].count,
      ).toBe(7);
      expect(
        (
          await c.query(
            'SELECT id,name,"createdAt","ownerUserId" FROM "Exercise" WHERE id=$1',
            [id],
          )
        ).rows,
      ).toEqual(identity);
      await c.query(sql);
      expect(
        (
          await c.query(
            'SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',
            [id],
          )
        ).rows[0],
      ).toEqual(first);
      expect(
        (
          await c.query(
            'SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',
            [id],
          )
        ).rows,
      ).toEqual(others);
      const manual = { ...review, version: "manual-review" };
      await c.query(
        'UPDATE "Exercise" SET "anatomyReview"=$2::jsonb WHERE id=$1',
        [id, JSON.stringify(manual)],
      );
      await c.query(sql);
      expect(
        (
          await c.query('SELECT "anatomyReview" FROM "Exercise" WHERE id=$1', [
            id,
          ])
        ).rows[0].anatomyReview,
      ).toEqual(manual);
      await c.query('UPDATE "Exercise" SET "anatomyReview"=NULL WHERE id=$1', [
        id,
      ]);
      await c.query(
        `UPDATE "ExerciseMuscle" SET role='PRIMARY' WHERE "exerciseId"=$1 AND "muscleGroup"='ADDUCTORS'`,
        [id],
      );
      await c.query("SAVEPOINT manual_classification");
      await expect(c.query(sql)).rejects.toThrow(/classification changed/);
      await c.query("ROLLBACK TO SAVEPOINT manual_classification");
      await c.query(
        "UPDATE \"Exercise\" SET name='Edited by admin' WHERE id=$1",
        [id],
      );
      await c.query("SAVEPOINT manual_identity");
      await expect(c.query(sql)).rejects.toThrow(/identity changed/);
      await c.query("ROLLBACK TO SAVEPOINT manual_identity");
    } finally {
      await c.query("ROLLBACK");
      await c.end();
    }
  });

  it("finds broad groups, muscles and regions once and serves the reviewed instructions", async () => {
    const { prisma } = await import("../../src/lib/db.js");
    const { ListExercises } =
      await import("../../src/usecases/ListExercises.js");
    const { GetExerciseMedia } =
      await import("../../src/usecases/GetExerciseMedia.js");
    const { createTestUser, cleanupTestUsers } =
      await import("../helpers/test-db.js");
    const user = await createTestUser();
    const exercise = await prisma.exercise.create({
      data: {
        name: `Leg press test ${crypto.randomUUID()}`,
        ownerUserId: user.id,
        isUnilateral: false,
        anatomyReview: review,
        muscles: { create: [...muscles] },
      },
    });
    try {
      for (const query of [
        "glúteos",
        "posteriores",
        "quadríceps",
        "glúteo médio",
        "reto abdominal",
        "adutor magno",
        "bíceps femoral cabeça longa",
      ]) {
        const rows = await new ListExercises().execute({
          userId: user.id,
          query,
        });
        expect(rows.filter((row) => row.id === exercise.id)).toHaveLength(1);
        expect(rows.find((row) => row.id === exercise.id)?.anatomy).toEqual(
          review,
        );
      }
      expect(
        (
          await new GetExerciseMedia().execute({
            userId: user.id,
            exerciseId: exercise.id,
          })
        ).instructions,
      ).toEqual(review.instructions);
    } finally {
      await prisma.exercise.delete({ where: { id: exercise.id } });
      await cleanupTestUsers([user.id]);
    }
  });
});
