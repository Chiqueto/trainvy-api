import { readFileSync } from "node:fs";

import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";

import { resolveCanonicalExerciseMap } from "../../src/domain/canonical-exercise.js";
import { ExerciseAnatomySchema, getExerciseAnatomy } from "../../src/domain/exercise-anatomy.js";
import { REVIEWED_EXERCISES_BY_ID } from "../../src/domain/exercise-catalog-review.js";
import manifest from "../../src/domain/upper-exercise-reviews.json" with {type:"json"};
import { getDatabaseUrl, prisma } from "../../src/lib/db.js";
import { AnimationKeySchema } from "../../src/schemas/exercise-demonstration.js";
import { GetExerciseMedia } from "../../src/usecases/GetExerciseMedia.js";
import { ListExercises } from "../../src/usecases/ListExercises.js";
import { cleanupTestUsers,createTestUser } from "../helpers/test-db.js";
const anatomy=(file:string)=>ExerciseAnatomySchema.parse(JSON.parse(readFileSync(new URL('../../src/domain/'+file,import.meta.url),'utf8')));
describe('individual shoulder and curl review delivery',()=>{
 it.each(manifest)('$key validates its identity, muscles, persistence and manual safeguards',async job=>{
  const review=anatomy(job.anatomyFile),entry=REVIEWED_EXERCISES_BY_ID.get(job.id)!;
  expect(AnimationKeySchema.parse(job.key)).toBe(job.key);
  const pairs=[...entry.primary.map(muscleGroup=>({muscleGroup,role:'PRIMARY'})),...entry.secondary.map(muscleGroup=>({muscleGroup,role:'SECONDARY'}))];
  expect(getExerciseAnatomy(review,pairs)).toEqual(review);
  const sql=readFileSync(new URL('../../prisma/migrations/'+job.migration+'/migration.sql',import.meta.url),'utf8').replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
  const c=new Client({connectionString:getDatabaseUrl()});await c.connect();
  try{
   await c.query('BEGIN');
   await c.query('INSERT INTO "Exercise"(id,name,"isUnilateral","createdAt","updatedAt") VALUES($1,$2,false,NOW(),NOW()) ON CONFLICT(id) DO NOTHING',[job.id,job.name]);
   const baseline=async(reviewValue:unknown=null)=>{
    await c.query('UPDATE "Exercise" SET name=$2,"ownerUserId"=NULL,"anatomyReview"=$3::jsonb,"updatedAt"=\'2000-01-01\' WHERE id=$1',[job.id,job.name,reviewValue?JSON.stringify(reviewValue):null]);
    await c.query('DELETE FROM "ExerciseMuscle" WHERE "exerciseId"=$1',[job.id]);
    for(const [role,groups] of [['PRIMARY',job.previous.primary],['SECONDARY',job.previous.secondary]] as const)for(const group of groups)await c.query('INSERT INTO "ExerciseMuscle"(id,"exerciseId","muscleGroup",role,"createdAt") VALUES(gen_random_uuid()::text,$1,$2::"MuscleGroup",$3::"MuscleRole",NOW())',[job.id,group,role]);
   };
   await baseline();
   const others=(await c.query('SELECT id,name,"anatomyReview","updatedAt" FROM "Exercise" WHERE id<>$1 ORDER BY id',[job.id])).rows;
   await c.query(sql);
   const first=(await c.query('SELECT name,"anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[job.id])).rows[0];
   expect(first.anatomyReview).toEqual(review);expect(first.name).toBe(job.name);
   expect((await c.query('SELECT "muscleGroup",role FROM "ExerciseMuscle" WHERE "exerciseId"=$1',[job.id])).rows).toEqual(expect.arrayContaining(pairs));
   await c.query(sql);expect((await c.query('SELECT name,"anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[job.id])).rows[0]).toEqual(first);
   expect((await c.query('SELECT id,name,"anatomyReview","updatedAt" FROM "Exercise" WHERE id<>$1 ORDER BY id',[job.id])).rows).toEqual(others);
   const manual={...review,notes:'Manual review retained'};await baseline(manual);await c.query(sql);
   expect((await c.query('SELECT "anatomyReview" FROM "Exercise" WHERE id=$1',[job.id])).rows[0].anatomyReview).toEqual(manual);
   await baseline();await c.query('UPDATE "Exercise" SET name=\'Different movement\' WHERE id=$1',[job.id]);await c.query(sql);
   expect((await c.query('SELECT "anatomyReview" FROM "Exercise" WHERE id=$1',[job.id])).rows[0].anatomyReview).toBeNull();
  }finally{await c.query('ROLLBACK');await c.end();}
 });
 it('keeps historical curl lookup and resolves custom ownership before the generic alias',async()=>{
  const row=(id:string,name:string,ownerUserId:string|null)=>({id,name,ownerUserId,isUnilateral:false,anatomyReview:null,muscles:[],media:[],demonstrations:[]});
  const a=row(manifest[3].id,manifest[3].name,null),legacy=row(manifest[4].id,manifest[4].name,null),custom=row('owned','Rosca Direta','athlete');
  const find=vi.spyOn(prisma.exercise,'findMany').mockResolvedValue([a,legacy] as never),sessions=vi.spyOn(prisma.sessionExercise,'findMany').mockResolvedValue([{exerciseId:legacy.id}] as never);
  try{
   expect((await new ListExercises().execute({userId:'athlete'})).map(e=>e.id)).toEqual([a.id]);
   find.mockResolvedValue([legacy] as never);expect((await new ListExercises().execute({userId:'athlete',onlyWithHistory:true}))[0].id).toBe(legacy.id);
   find.mockResolvedValue([a,legacy,custom] as never);expect((await resolveCanonicalExerciseMap({userId:'athlete',names:['Rosca Direta']})).get('Rosca Direta')).toBe(custom.id);
  }finally{find.mockRestore();sessions.mockRestore();}
 });
 it('serves reviewed muscles and instructions through normal search and media flows',async()=>{
  const user=await createTestUser(),created:string[]=[];
  try{
   for(const job of manifest.filter(j=>!('retired' in j&&j.retired))){const review=anatomy(job.anatomyFile),entry=REVIEWED_EXERCISES_BY_ID.get(job.id)!;
    const exercise=await prisma.exercise.create({data:{name:job.name,ownerUserId:user.id,anatomyReview:review,muscles:{create:[...entry.primary.map(muscleGroup=>({muscleGroup,role:'PRIMARY' as const})),...entry.secondary.map(muscleGroup=>({muscleGroup,role:'SECONDARY' as const}))]}}});created.push(exercise.id);
    expect((await new ListExercises().execute({userId:user.id,query:review.participants[0].label})).some(e=>e.id===exercise.id)).toBe(true);
    expect((await new GetExerciseMedia().execute({userId:user.id,exerciseId:exercise.id})).instructions).toEqual(review.instructions);
   }
  }finally{await prisma.exercise.deleteMany({where:{id:{in:created}}});await cleanupTestUsers([user.id]);}
 });
});
