import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { ExerciseAnatomySchema, anatomySearchTerms, getExerciseAnatomy } from "../../src/domain/exercise-anatomy.js";
import { REVIEWED_EXERCISES_BY_ID } from "../../src/domain/exercise-catalog-review.js";
import { getDatabaseUrl } from "../../src/lib/db.js";
const id = "d555deb1-6eef-436d-8377-9427ac267697";
const review = ExerciseAnatomySchema.parse(JSON.parse(readFileSync(new URL("../../src/domain/flat-dumbbell-fly-anatomy.json", import.meta.url), "utf8")));
const sql = readFileSync(new URL("../../prisma/migrations/20261028152000_flat_dumbbell_fly_anatomy/migration.sql", import.meta.url), "utf8").replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");
describe("flat dumbbell fly review", () => {
  it("agrees with the versioned classification and exposes its anatomical search terms", () => {
    const entry = REVIEWED_EXERCISES_BY_ID.get(id)!;
    expect(entry.primary).toEqual(["CHEST"]);
    expect(entry.secondary).toEqual(["SHOULDERS", "BICEPS"]);
    const muscles = review.participants.map(({muscleGroup,role})=>({muscleGroup,role}));
    expect(getExerciseAnatomy(review,muscles)).toEqual(review);
    expect(getExerciseAnatomy(review,muscles.slice(0,2))).toBeNull();
    expect(anatomySearchTerms(review)).toEqual(expect.arrayContaining(["peito", "Deltoide anterior", "Bíceps braquial", "peitoral superior"]));
  });
  it("applies only to the target, adds biceps, is idempotent and protects manual classifications", async () => {
    const c = new Client({connectionString:getDatabaseUrl()}); await c.connect();
    try {
      await c.query("BEGIN");
      await c.query('INSERT INTO "Exercise" (id,name,"isUnilateral","createdAt","updatedAt") VALUES ($1,$2,false,NOW(),NOW()) ON CONFLICT (id) DO NOTHING',[id,"Crucifixo Reto com Halteres"]);
      await c.query('UPDATE "Exercise" SET "anatomyReview"=NULL WHERE id=$1',[id]);
      await c.query('DELETE FROM "ExerciseMuscle" WHERE "exerciseId"=$1',[id]);
      await c.query(`INSERT INTO "ExerciseMuscle" (id,"exerciseId","muscleGroup",role,"createdAt") VALUES (gen_random_uuid()::text,$1,'CHEST','PRIMARY',NOW()),(gen_random_uuid()::text,$1,'SHOULDERS','SECONDARY',NOW())`,[id]);
      const others=(await c.query('SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',[id])).rows;
      await c.query(sql);
      const first=(await c.query('SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[id])).rows[0];
      expect(first.anatomyReview).toEqual(review);
      expect((await c.query('SELECT "muscleGroup",role FROM "ExerciseMuscle" WHERE "exerciseId"=$1 ORDER BY "muscleGroup"',[id])).rows).toEqual(expect.arrayContaining([{muscleGroup:'BICEPS',role:'SECONDARY'},{muscleGroup:'CHEST',role:'PRIMARY'},{muscleGroup:'SHOULDERS',role:'SECONDARY'}]));
      await c.query(sql); expect((await c.query('SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[id])).rows[0]).toEqual(first);
      expect((await c.query('SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',[id])).rows).toEqual(others);
      await c.query('UPDATE "Exercise" SET "anatomyReview"=NULL WHERE id=$1',[id]);
      await c.query(`UPDATE "ExerciseMuscle" SET role='PRIMARY' WHERE "exerciseId"=$1 AND "muscleGroup"='BICEPS'`,[id]);
      await c.query('SAVEPOINT manual_review'); await expect(c.query(sql)).rejects.toThrow(/classification changed/); await c.query('ROLLBACK TO SAVEPOINT manual_review');
      expect((await c.query('SELECT role FROM "ExerciseMuscle" WHERE "exerciseId"=$1 AND "muscleGroup"=\'BICEPS\'',[id])).rows[0].role).toBe('PRIMARY');
    } finally { await c.query('ROLLBACK'); await c.end(); }
  });
});


describe("flat dumbbell fly catalog search", () => {
  it("finds the reviewed exercise by group and specific participants without duplicates", async () => {
    const { prisma } = await import("../../src/lib/db.js");
    const { ListExercises } = await import("../../src/usecases/ListExercises.js");
    const { createTestUser, cleanupTestUsers } = await import("../helpers/test-db.js");
    const user = await createTestUser();
    const exercise = await prisma.exercise.create({data:{name:`Fly test ${crypto.randomUUID()}`,ownerUserId:user.id,isUnilateral:false,anatomyReview:review,muscles:{create:review.participants.map(({muscleGroup,role})=>({muscleGroup,role}))}}});
    try {
      for (const query of ["peito", "peitoral superior", "deltoide anterior", "bíceps braquial"]) {
        const rows = await new ListExercises().execute({userId:user.id,query});
        expect(rows.filter(row=>row.id===exercise.id)).toHaveLength(1);
        expect(rows.find(row=>row.id===exercise.id)?.anatomy).toEqual(review);
      }
    } finally { await prisma.exercise.delete({where:{id:exercise.id}}); await cleanupTestUsers([user.id]); }
  });
});
