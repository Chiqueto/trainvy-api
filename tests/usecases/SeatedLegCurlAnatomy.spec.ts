import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { ExerciseAnatomySchema, anatomySearchTerms, getExerciseAnatomy } from "../../src/domain/exercise-anatomy.js";
import { REVIEWED_EXERCISES_BY_ID } from "../../src/domain/exercise-catalog-review.js";
import { getDatabaseUrl } from "../../src/lib/db.js";

const id = "00000000-0000-4000-8000-000000000111";
const review = ExerciseAnatomySchema.parse(JSON.parse(readFileSync(new URL("../../src/domain/seated-leg-curl-anatomy.json", import.meta.url), "utf8")));
const muscles = [
  {muscleGroup:"HAMSTRINGS",role:"PRIMARY"},
  {muscleGroup:"CALVES",role:"SECONDARY"},
  {muscleGroup:"HIP_FLEXORS",role:"SECONDARY"},
  {muscleGroup:"ADDUCTORS",role:"SECONDARY"},
] as const;
const sql = readFileSync(new URL("../../prisma/migrations/20261030140000_seated_leg_curl_000111_anatomy/migration.sql", import.meta.url), "utf8").replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");

describe("seated leg curl anatomical review", () => {
  it("aligns the detailed anatomy, broad groups, named search terms and delivered migration", () => {
    const entry = REVIEWED_EXERCISES_BY_ID.get(id)!;
    expect(entry.primary).toEqual(["HAMSTRINGS"]);
    expect(entry.secondary).toEqual(["CALVES","HIP_FLEXORS","ADDUCTORS"]);
    expect(getExerciseAnatomy(review,[...muscles])).toEqual(review);
    expect(getExerciseAnatomy(review,muscles.slice(0,2))).toBeNull();
    expect(review.participants.filter(p=>p.role==="PRIMARY")).toHaveLength(3);
    expect(anatomySearchTerms(review)).toEqual(expect.arrayContaining(["posteriores da coxa","Semitendíneo","Semimembranáceo","bíceps femoral cabeça curta","Gastrocnêmio","Sartório","Grácil"]));
    expect(JSON.parse(/SET "anatomyReview"='(.+)'::jsonb/.exec(sql)![1].replaceAll("''", "'"))).toEqual(review);
  });

  it("migrates only its UUID, invalidates cache, deduplicates broad groups and preserves existing reviews", async () => {
    const c = new Client({connectionString:getDatabaseUrl()}); await c.connect();
    try {
      await c.query("BEGIN");
      await c.query('INSERT INTO "Exercise" (id,name,"isUnilateral","createdAt","updatedAt") VALUES ($1,$2,false,NOW(),NOW()) ON CONFLICT (id) DO NOTHING',[id,"Cadeira Flexora"]);
      await c.query('UPDATE "Exercise" SET "anatomyReview"=NULL,"updatedAt"=\'2000-01-01\' WHERE id=$1',[id]);
      await c.query('DELETE FROM "ExerciseMuscle" WHERE "exerciseId"=$1',[id]);
      await c.query(`INSERT INTO "ExerciseMuscle" (id,"exerciseId","muscleGroup",role,"createdAt") VALUES (gen_random_uuid()::text,$1,'HAMSTRINGS','PRIMARY',NOW()),(gen_random_uuid()::text,$1,'CALVES','SECONDARY',NOW())`,[id]);
      const identity=(await c.query('SELECT id,name,"createdAt","ownerUserId" FROM "Exercise" WHERE id=$1',[id])).rows;
      const others=(await c.query('SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',[id])).rows;
      await c.query(sql);
      const first=(await c.query('SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[id])).rows[0];
      expect(first.anatomyReview).toEqual(review);
      expect(new Date(first.updatedAt).getTime()).toBeGreaterThan(new Date('2000-01-01').getTime());
      expect((await c.query('SELECT "muscleGroup",role FROM "ExerciseMuscle" WHERE "exerciseId"=$1',[id])).rows).toEqual(expect.arrayContaining([...muscles]));
      expect((await c.query('SELECT count(*)::int AS count FROM "ExerciseMuscle" WHERE "exerciseId"=$1',[id])).rows[0].count).toBe(4);
      expect((await c.query('SELECT id,name,"createdAt","ownerUserId" FROM "Exercise" WHERE id=$1',[id])).rows).toEqual(identity);
      await c.query(sql);
      expect((await c.query('SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[id])).rows[0]).toEqual(first);
      expect((await c.query('SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',[id])).rows).toEqual(others);
      const manual={...review,version:"manual-review"};
      await c.query('UPDATE "Exercise" SET "anatomyReview"=$2::jsonb WHERE id=$1',[id,JSON.stringify(manual)]);
      await c.query(sql);
      expect((await c.query('SELECT "anatomyReview" FROM "Exercise" WHERE id=$1',[id])).rows[0].anatomyReview).toEqual(manual);
      await c.query('UPDATE "Exercise" SET "anatomyReview"=NULL WHERE id=$1',[id]);
      await c.query(`UPDATE "ExerciseMuscle" SET role='PRIMARY' WHERE "exerciseId"=$1 AND "muscleGroup"='CALVES'`,[id]);
      await c.query('SAVEPOINT manual_classification');
      await expect(c.query(sql)).rejects.toThrow(/classification changed/);
      await c.query('ROLLBACK TO SAVEPOINT manual_classification');
      await c.query('UPDATE "Exercise" SET name=\'Edited by admin\' WHERE id=$1',[id]);
      await c.query('SAVEPOINT manual_identity');
      await expect(c.query(sql)).rejects.toThrow(/identity changed/);
      await c.query('ROLLBACK TO SAVEPOINT manual_identity');
    } finally { await c.query('ROLLBACK'); await c.end(); }
  });

  it("finds broad groups, muscles and regions once and serves the reviewed instructions", async () => {
    const { prisma } = await import("../../src/lib/db.js");
    const { ListExercises } = await import("../../src/usecases/ListExercises.js");
    const { GetExerciseMedia } = await import("../../src/usecases/GetExerciseMedia.js");
    const { createTestUser, cleanupTestUsers } = await import("../helpers/test-db.js");
    const user=await createTestUser();
    const exercise=await prisma.exercise.create({data:{name:`Flexora test ${crypto.randomUUID()}`,ownerUserId:user.id,isUnilateral:false,anatomyReview:review,muscles:{create:[...muscles]}}});
    try {
      for (const query of ["posteriores","isquiotibiais","semitendíneo","semimembranoso","bíceps femoral cabeça curta","gastrocnêmio medial","sartório","grácil"]) {
        const rows=await new ListExercises().execute({userId:user.id,query});
        expect(rows.filter(row=>row.id===exercise.id)).toHaveLength(1);
        expect(rows.find(row=>row.id===exercise.id)?.anatomy).toEqual(review);
      }
      expect((await new GetExerciseMedia().execute({userId:user.id,exerciseId:exercise.id})).instructions).toEqual(review.instructions);
    } finally {await prisma.exercise.delete({where:{id:exercise.id}});await cleanupTestUsers([user.id]);}
  });
});
