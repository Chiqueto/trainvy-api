import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import {
  anatomySearchTerms,
  ExerciseAnatomySchema,
  getExerciseAnatomy,
} from "../../src/domain/exercise-anatomy.js";
import { getDatabaseUrl } from "../../src/lib/db.js";
import { REVIEWED_EXERCISES_BY_ID } from "../../src/domain/exercise-catalog-review.js";

const id = "00000000-0000-4000-8000-000000000118";
const review = ExerciseAnatomySchema.parse(
  JSON.parse(
    readFileSync(
      new URL("../../src/domain/seated-calf-anatomy.json", import.meta.url),
      "utf8",
    ),
  ),
);
const sql = readFileSync(
  new URL(
    "../../prisma/migrations/20261106173000_seated_calf_000118/migration.sql",
    import.meta.url,
  ),
  "utf8",
)
  .replace(/^BEGIN;\s*$/m, "")
  .replace(/^COMMIT;\s*$/m, "");
const muscles = [{ muscleGroup: "CALVES", role: "PRIMARY" }] as const;
describe("seated calf anatomical review", () => {
  it("supports primary and secondary muscles within one broad group", () => {
    expect(getExerciseAnatomy(review, [...muscles])).toEqual(review);
    expect(
      getExerciseAnatomy(review, [
        { muscleGroup: "CALVES", role: "SECONDARY" },
      ]),
    ).toBeNull();
    expect(anatomySearchTerms(review)).toEqual(
      expect.arrayContaining(["Gastrocnêmio medial", "Sóleo", "Fibular longo"]),
    );
    expect(REVIEWED_EXERCISES_BY_ID.get(id)?.primary).toEqual(["CALVES"]);
    expect(REVIEWED_EXERCISES_BY_ID.get(id)?.secondary).toEqual([]);
    expect(
      JSON.parse(
        /SET "anatomyReview"='(.+?)'::jsonb/
          .exec(sql)![1]
          .replaceAll("''", "'"),
      ),
    ).toEqual(review);
  });
  it("migrates the baseline only and preserves manual reviews and other exercises", async () => {
    const c = new Client({ connectionString: getDatabaseUrl() });
    await c.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        'INSERT INTO "Exercise" (id,name,"isUnilateral","createdAt","updatedAt") VALUES ($1,$2,false,NOW(),NOW()) ON CONFLICT (id) DO NOTHING',
        [id, "Panturrilha Sentado"],
      );
      await c.query(
        'UPDATE "Exercise" SET name=$2,"ownerUserId"=NULL,"anatomyReview"=NULL,"updatedAt"=\'2000-01-01\' WHERE id=$1',
        [id, "Panturrilha Sentado"],
      );
      await c.query('DELETE FROM "ExerciseMuscle" WHERE "exerciseId"=$1', [id]);
      await c.query(
        'INSERT INTO "ExerciseMuscle" (id,"exerciseId","muscleGroup",role,"createdAt") VALUES (gen_random_uuid()::text,$1,\'CALVES\',\'PRIMARY\',NOW())',
        [id],
      );
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
      expect(
        (
          await c.query(
            'SELECT "muscleGroup",role FROM "ExerciseMuscle" WHERE "exerciseId"=$1',
            [id],
          )
        ).rows,
      ).toEqual(expect.arrayContaining([...muscles]));
      await c.query(sql);
      expect(
        (
          await c.query(
            'SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',
            [id],
          )
        ).rows[0],
      ).toEqual(first);
      const manual = { ...review, version: "manual" };
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
      expect(
        (
          await c.query(
            'SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',
            [id],
          )
        ).rows,
      ).toEqual(others);
      await c.query('UPDATE "Exercise" SET "anatomyReview"=NULL WHERE id=$1', [
        id,
      ]);
      await c.query(
        'UPDATE "ExerciseMuscle" SET role=\'SECONDARY\' WHERE "exerciseId"=$1 AND "muscleGroup"=\'CALVES\'',
        [id],
      );
      await c.query("SAVEPOINT classification");
      await expect(c.query(sql)).rejects.toThrow(/classification changed/);
      await c.query("ROLLBACK TO SAVEPOINT classification");
    } finally {
      await c.query("ROLLBACK");
      await c.end();
    }
  });
  it("finds specific muscles once and returns reviewed instructions", async () => {
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
        name: `Seated calf ${crypto.randomUUID()}`,
        ownerUserId: user.id,
        isUnilateral: false,
        anatomyReview: review,
        muscles: { create: [...muscles] },
      },
    });
    try {
      for (const query of [
        "panturrilha",
        "sóleo",
        "gastrocnêmio",
        "fibular longo",
      ]) {
        const rows = await new ListExercises().execute({
          userId: user.id,
          query,
        });
        expect(rows.filter((r) => r.id === exercise.id)).toHaveLength(1);
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
