import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { ExerciseAnatomySchema, anatomySearchTerms, getExerciseAnatomy } from "../../src/domain/exercise-anatomy.js";
import { REVIEWED_EXERCISES_BY_ID } from "../../src/domain/exercise-catalog-review.js";
import { getDatabaseUrl } from "../../src/lib/db.js";

const id = "00000000-0000-4000-8000-000000000110";
const review = ExerciseAnatomySchema.parse(JSON.parse(readFileSync(new URL("../../src/domain/leg-extension-anatomy.json", import.meta.url), "utf8")));
const muscles = [{muscleGroup:"QUADRICEPS",role:"PRIMARY"}, {muscleGroup:"HAMSTRINGS",role:"SECONDARY"}] as const;
const sql = readFileSync(new URL("../../prisma/migrations/20261030133000_leg_extension_000110_anatomy/migration.sql", import.meta.url), "utf8").replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");

describe("leg extension anatomical review", () => {
  it("keeps four quadriceps heads in a single primary group and distinguishes antagonist coactivation", () => {
    const entry = REVIEWED_EXERCISES_BY_ID.get(id)!;
    expect(entry.primary).toEqual(["QUADRICEPS"]);
    expect(entry.secondary).toEqual(["HAMSTRINGS"]);
    expect(getExerciseAnatomy(review,[...muscles])).toEqual(review);
    expect(getExerciseAnatomy(review,[muscles[0]])).toBeNull();
    expect(review.participants.filter(p=>p.role==="PRIMARY")).toHaveLength(4);
    expect(anatomySearchTerms(review)).toEqual(expect.arrayContaining(["quadríceps","Reto femoral","Vasto intermédio","bíceps femoral"]));
    expect(JSON.parse(/SET "anatomyReview"='(.+)'::jsonb/.exec(sql)![1].replaceAll("''", "'"))).toEqual(review);
  });

  it("migrates only the target, preserves identity/history, is idempotent and rejects conflicting manual classifications", async () => {
    const c = new Client({connectionString:getDatabaseUrl()}); await c.connect();
    try {
      await c.query("BEGIN");
      await c.query('INSERT INTO "Exercise" (id,name,"isUnilateral","createdAt","updatedAt") VALUES ($1,$2,false,NOW(),NOW()) ON CONFLICT (id) DO NOTHING',[id,"Cadeira Extensora"]);
      await c.query('UPDATE "Exercise" SET "anatomyReview"=NULL WHERE id=$1',[id]);
      await c.query('DELETE FROM "ExerciseMuscle" WHERE "exerciseId"=$1',[id]);
      await c.query(`INSERT INTO "ExerciseMuscle" (id,"exerciseId","muscleGroup",role,"createdAt") VALUES (gen_random_uuid()::text,$1,'QUADRICEPS','PRIMARY',NOW())`,[id]);
      const identity=(await c.query('SELECT id,name,"createdAt","ownerUserId" FROM "Exercise" WHERE id=$1',[id])).rows;
      const others=(await c.query('SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',[id])).rows;
      await c.query(sql);
      const first=(await c.query('SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[id])).rows[0];
      expect(first.anatomyReview).toEqual(review);
      expect((await c.query('SELECT "muscleGroup",role FROM "ExerciseMuscle" WHERE "exerciseId"=$1 ORDER BY "muscleGroup"::text',[id])).rows).toEqual([{muscleGroup:"HAMSTRINGS",role:"SECONDARY"},{muscleGroup:"QUADRICEPS",role:"PRIMARY"}]);
      expect((await c.query('SELECT id,name,"createdAt","ownerUserId" FROM "Exercise" WHERE id=$1',[id])).rows).toEqual(identity);
      await c.query(sql);
      expect((await c.query('SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[id])).rows[0]).toEqual(first);
      expect((await c.query('SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',[id])).rows).toEqual(others);
      await c.query('UPDATE "Exercise" SET "anatomyReview"=NULL WHERE id=$1',[id]);
      await c.query(`UPDATE "ExerciseMuscle" SET role='PRIMARY' WHERE "exerciseId"=$1 AND "muscleGroup"='HAMSTRINGS'`,[id]);
      await c.query('SAVEPOINT manual_review');
      await expect(c.query(sql)).rejects.toThrow(/classification changed/);
      await c.query('ROLLBACK TO SAVEPOINT manual_review');
    } finally { await c.query('ROLLBACK'); await c.end(); }
  });

  it("finds broad and specific muscles once and returns the reviewed instructions", async () => {
    const { prisma } = await import("../../src/lib/db.js");
    const { ListExercises } = await import("../../src/usecases/ListExercises.js");
    const { GetExerciseMedia } = await import("../../src/usecases/GetExerciseMedia.js");
    const { createTestUser, cleanupTestUsers } = await import("../helpers/test-db.js");
    const user=await createTestUser();
    const exercise=await prisma.exercise.create({data:{name:`Extensora test ${crypto.randomUUID()}`,ownerUserId:user.id,isUnilateral:false,anatomyReview:review,muscles:{create:[...muscles]}}});
    try {
      for (const query of ["quadríceps","reto femoral","vasto intermédio","bíceps femoral"]) {
        const rows=await new ListExercises().execute({userId:user.id,query});
        expect(rows.filter(row=>row.id===exercise.id)).toHaveLength(1);
        expect(rows.find(row=>row.id===exercise.id)?.anatomy).toEqual(review);
      }
      expect((await new GetExerciseMedia().execute({userId:user.id,exerciseId:exercise.id})).instructions).toEqual(review.instructions);
    } finally {await prisma.exercise.delete({where:{id:exercise.id}});await cleanupTestUsers([user.id]);}
  });
});
