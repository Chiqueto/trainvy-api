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
const id = "1b7764ca-1826-488e-8734-fc88117ed9dd";
const review = ExerciseAnatomySchema.parse(
  JSON.parse(
    readFileSync(
      new URL(
        "../../src/domain/hang-power-clean-anatomy.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
const sql = readFileSync(
  new URL(
    "../../prisma/migrations/20261110183000_hang_power_clean_1b7764ca/migration.sql",
    import.meta.url,
  ),
  "utf8",
)
  .replace(/^BEGIN;\s*$/m, "")
  .replace(/^COMMIT;\s*$/m, "");
const catalog = REVIEWED_EXERCISES_BY_ID.get(id)!;
const muscles = [
  ...catalog.primary.map((muscleGroup) => ({
    muscleGroup,
    role: "PRIMARY" as const,
  })),
  ...catalog.secondary.map((muscleGroup) => ({
    muscleGroup,
    role: "SECONDARY" as const,
  })),
];
describe("Hang Power Clean review", () => {
  it("matches catalog, migration and muscle-specific search terms", () => {
    expect(getExerciseAnatomy(review, muscles)).toEqual(review);
    expect(anatomySearchTerms(review)).toEqual(
      expect.arrayContaining([
        "Glúteo máximo",
        "Trapézio",
        "Deltoide anterior",
        "Bíceps braquial",
      ]),
    );
    expect(
      JSON.parse(
        /SET "anatomyReview"='(.+?)'::jsonb/
          .exec(sql)![1]
          .replaceAll("''", "'"),
      ),
    ).toEqual(review);
    expect(catalog.primary).toEqual(["QUADRICEPS", "GLUTES", "HAMSTRINGS"]);
  });
  it("migrates only this baseline, preserves manual reviews and refuses changed identity or classification", async () => {
    const c = new Client({ connectionString: getDatabaseUrl() });
    await c.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        'INSERT INTO "Exercise" (id,name,"isUnilateral","createdAt","updatedAt") VALUES ($1,\'Hang Power Clean\',false,NOW(),NOW()) ON CONFLICT (id) DO NOTHING',
        [id],
      );
      await c.query(
        'UPDATE "Exercise" SET name=\'Hang Power Clean\',"ownerUserId"=NULL,"anatomyReview"=NULL,"updatedAt"=\'2000-01-01\' WHERE id=$1',
        [id],
      );
      await c.query('DELETE FROM "ExerciseMuscle" WHERE "exerciseId"=$1', [id]);
      for (const m of muscles.filter(
        (m) => !["BICEPS", "ADDUCTORS"].includes(m.muscleGroup),
      ))
        await c.query(
          'INSERT INTO "ExerciseMuscle" (id,"exerciseId","muscleGroup",role,"createdAt") VALUES (gen_random_uuid()::text,$1,$2::"MuscleGroup",$3::"MuscleRole",NOW())',
          [id, m.muscleGroup, m.role],
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
      const stored = (
        await c.query(
          'SELECT "muscleGroup",role FROM "ExerciseMuscle" WHERE "exerciseId"=$1',
          [id],
        )
      ).rows;
      expect(stored).toHaveLength(muscles.length);
      expect(stored).toEqual(expect.arrayContaining(muscles));
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
        'UPDATE "ExerciseMuscle" SET role=\'SECONDARY\' WHERE "exerciseId"=$1 AND "muscleGroup"=\'GLUTES\'',
        [id],
      );
      await c.query("SAVEPOINT classification");
      await expect(c.query(sql)).rejects.toThrow(/classification changed/);
      await c.query("ROLLBACK TO SAVEPOINT classification");
      await c.query("UPDATE \"Exercise\" SET name='Hang Clean' WHERE id=$1", [
        id,
      ]);
      await c.query("SAVEPOINT identity");
      await expect(c.query(sql)).rejects.toThrow(/identity changed/);
      await c.query("ROLLBACK TO SAVEPOINT identity");
    } finally {
      await c.query("ROLLBACK");
      await c.end();
    }
  });
  it("finds the detailed anatomy once and serves the reviewed instructions", async () => {
    const { prisma } = await import("../../src/lib/db.js"),
      { ListExercises } = await import("../../src/usecases/ListExercises.js"),
      { GetExerciseMedia } =
        await import("../../src/usecases/GetExerciseMedia.js"),
      { createTestUser, cleanupTestUsers } =
        await import("../helpers/test-db.js");
    const user = await createTestUser();
    let exerciseId: string | undefined;
    try {
      const exercise = await prisma.exercise.create({
        data: {
          name: `Hang test ${crypto.randomUUID()}`,
          ownerUserId: user.id,
          isUnilateral: false,
          anatomyReview: review,
          muscles: { create: muscles },
        },
      });
      exerciseId = exercise.id;
      for (const query of [
        "quadríceps",
        "glúteo máximo",
        "trapézio",
        "bíceps braquial",
        "deltoide anterior",
        "adutor magno",
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
      if (exerciseId)
        await prisma.exercise.delete({ where: { id: exerciseId } });
      await cleanupTestUsers([user.id]);
    }
  });
});
