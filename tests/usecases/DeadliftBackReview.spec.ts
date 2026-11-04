import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { anatomySearchTerms, ExerciseAnatomySchema, getExerciseAnatomy } from "../../src/domain/exercise-anatomy.js";
import { getDatabaseUrl } from "../../src/lib/db.js";

const id = "00000000-0000-4000-8000-000000000140";
const current = ExerciseAnatomySchema.parse(JSON.parse(readFileSync(new URL("../../src/domain/deadlift-anatomy.json", import.meta.url), "utf8")));
const old = ExerciseAnatomySchema.parse(JSON.parse(readFileSync(new URL("../fixtures/deadlift-anatomy-v1.json", import.meta.url), "utf8")));
const sql = readFileSync(new URL("../../prisma/migrations/20261104162000_deadlift_upper_back_000140/migration.sql", import.meta.url), "utf8").replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, "");
const muscles = [
  {muscleGroup:"GLUTES",role:"PRIMARY"},{muscleGroup:"QUADRICEPS",role:"PRIMARY"},{muscleGroup:"HAMSTRINGS",role:"PRIMARY"},
  {muscleGroup:"BACK",role:"SECONDARY"},{muscleGroup:"CORE",role:"SECONDARY"},{muscleGroup:"ADDUCTORS",role:"SECONDARY"},{muscleGroup:"FOREARMS",role:"SECONDARY"},
] as const;
describe("deadlift upper back revision", () => {
  it("validates participants, search terms, roles and migration payload", () => {
    expect(getExerciseAnatomy(current, [...muscles])).toEqual(current);
    expect(anatomySearchTerms(current)).toEqual(expect.arrayContaining(["Latíssimo do dorso", "Trapézio", "dorsal"]));
    expect(JSON.parse(/SET "anatomyReview"='(.+?)'::jsonb/.exec(sql)![1].replaceAll("''", "'"))).toEqual(current);
    expect(current.participants.filter(p=>["LATISSIMUS_DORSI","TRAPEZIUS"].includes(p.id)).every(p=>p.role==="SECONDARY")).toBe(true);
  });
  it("upgrades only the exact previous review and preserves manual edits", async () => {
    const c = new Client({connectionString:getDatabaseUrl()}); await c.connect();
    try {
      await c.query("BEGIN");
      await c.query('INSERT INTO "Exercise" (id,name,"isUnilateral","createdAt","updatedAt") VALUES ($1,$2,false,NOW(),NOW()) ON CONFLICT (id) DO NOTHING',[id,"Levantamento Terra"]);
      await c.query('UPDATE "Exercise" SET name=$2,"ownerUserId"=NULL,"anatomyReview"=$3::jsonb,"updatedAt"=\'2000-01-01\' WHERE id=$1',[id,"Levantamento Terra",JSON.stringify(old)]);
      await c.query('DELETE FROM "ExerciseMuscle" WHERE "exerciseId"=$1',[id]);
      for (const m of muscles) await c.query('INSERT INTO "ExerciseMuscle" (id,"exerciseId","muscleGroup",role,"createdAt") VALUES (gen_random_uuid()::text,$1,$2,$3,NOW())',[id,m.muscleGroup,m.role]);
      const others=(await c.query('SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',[id])).rows;
      await c.query(sql);
      const updated=(await c.query('SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[id])).rows[0];
      expect(updated.anatomyReview).toEqual(current);
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date("2000-01-01").getTime());
      await c.query(sql);
      expect((await c.query('SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[id])).rows[0]).toEqual(updated);
      const manual={...old,version:"manual"};
      await c.query('UPDATE "Exercise" SET "anatomyReview"=$2::jsonb WHERE id=$1',[id,JSON.stringify(manual)]); await c.query(sql);
      expect((await c.query('SELECT "anatomyReview" FROM "Exercise" WHERE id=$1',[id])).rows[0].anatomyReview).toEqual(manual);
      expect((await c.query('SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',[id])).rows).toEqual(others);
      await c.query('UPDATE "Exercise" SET "anatomyReview"=NULL WHERE id=$1',[id]);
      await c.query('UPDATE "ExerciseMuscle" SET role=\'PRIMARY\' WHERE "exerciseId"=$1 AND "muscleGroup"=\'CORE\'',[id]);
      await c.query("SAVEPOINT classification"); await expect(c.query(sql)).rejects.toThrow(/classification changed/); await c.query("ROLLBACK TO SAVEPOINT classification");
    } finally {await c.query("ROLLBACK"); await c.end();}
  });
  it("finds the newly reviewed muscles and serves the updated instructions", async () => {
    const {prisma}=await import("../../src/lib/db.js");
    const {ListExercises}=await import("../../src/usecases/ListExercises.js");
    const {GetExerciseMedia}=await import("../../src/usecases/GetExerciseMedia.js");
    const {createTestUser,cleanupTestUsers}=await import("../helpers/test-db.js");
    const user=await createTestUser();
    const exercise=await prisma.exercise.create({data:{name:`Deadlift back test ${crypto.randomUUID()}`,ownerUserId:user.id,isUnilateral:false,anatomyReview:current,muscles:{create:[...muscles]}}});
    try {
      for (const query of ["dorsal","trapézio","costas"]) {
        const rows=await new ListExercises().execute({userId:user.id,query});
        expect(rows.filter(row=>row.id===exercise.id)).toHaveLength(1);
        expect(rows.find(row=>row.id===exercise.id)?.anatomy).toEqual(current);
      }
      expect((await new GetExerciseMedia().execute({userId:user.id,exerciseId:exercise.id})).instructions).toEqual(current.instructions);
    } finally {await prisma.exercise.delete({where:{id:exercise.id}});await cleanupTestUsers([user.id]);}
  });
});
