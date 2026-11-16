import { readdirSync,readFileSync } from "node:fs";

import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";

import manifest from "../../src/domain/barbell-row-variants.json" with {type:"json"};
import {resolveCanonicalExerciseMap} from "../../src/domain/canonical-exercise.js";
import {anatomySearchTerms,ExerciseAnatomySchema,getExerciseAnatomy} from "../../src/domain/exercise-anatomy.js";
import {REVIEWED_EXERCISES_BY_ID} from "../../src/domain/exercise-catalog-review.js";
import {getDatabaseUrl,prisma} from "../../src/lib/db.js";
import {GetExerciseMedia} from "../../src/usecases/GetExerciseMedia.js";
import {ListExercises} from "../../src/usecases/ListExercises.js";
import {cleanupTestUsers,createTestUser} from "../helpers/test-db.js";
const read=(file:string)=>JSON.parse(readFileSync(new URL('../../src/domain/'+file,import.meta.url),'utf8'));
const root=new URL('../../prisma/migrations/',import.meta.url);
const previousFiles:Record<string,string>={
 'bent-row':'bent-row-scapular-anatomy.json','supinated-bent-row':'supinated-bent-row-anatomy.json',
 'high-bent-row':'high-bent-row-anatomy.json','generic-bent-row':'generic-bent-row-scapular-anatomy.json',
};
describe('barbell row anatomical destinations and catalog identities',()=>{
 it.each(manifest)('$animation has a valid reviewed catalog and safe idempotent migration',async entry=>{
  const review=ExerciseAnatomySchema.parse(read(entry.anatomyFile)),coarse=REVIEWED_EXERCISES_BY_ID.get(entry.id)!;
  const muscles=[...coarse.primary.map(muscleGroup=>({muscleGroup,role:'PRIMARY'})),...coarse.secondary.map(muscleGroup=>({muscleGroup,role:'SECONDARY'}))];
  expect(getExerciseAnatomy(review,muscles)).toEqual(review);
  expect(anatomySearchTerms(review)).toContain(entry.name);
  const folder=readdirSync(root).find(d=>d.startsWith('2026111618')&&d.endsWith(entry.animation.replaceAll('-','_')+'_landmarks'))!;
  const sql=readFileSync(new URL(folder+'/migration.sql',root),'utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
  const oldName=/AND name='([^']+)' AND COALESCE/.exec(sql)![1];
  const previous=previousFiles[entry.animation]?read(previousFiles[entry.animation]):null;
  const baseline=previous ? muscles : entry.animation==='pendlay-row' ? muscles.filter(m=>!['QUADRICEPS','HIP_ABDUCTORS'].includes(m.muscleGroup)) : [];
  const c=new Client({connectionString:getDatabaseUrl()});await c.connect();
  try{
   await c.query('BEGIN');
   await c.query('INSERT INTO "Exercise" (id,name,"isUnilateral","createdAt","updatedAt") VALUES ($1,$2,false,NOW(),NOW()) ON CONFLICT (id) DO NOTHING',[entry.id,oldName]);
   await c.query('UPDATE "Exercise" SET name=$2,"ownerUserId"=NULL,"anatomyReview"=$3::jsonb,"updatedAt"=\'2000-01-01\' WHERE id=$1',[entry.id,oldName,previous?JSON.stringify(previous):null]);
   await c.query('DELETE FROM "ExerciseMuscle" WHERE "exerciseId"=$1',[entry.id]);
   for(const m of baseline)await c.query('INSERT INTO "ExerciseMuscle" (id,"exerciseId","muscleGroup",role,"createdAt") VALUES(gen_random_uuid()::text,$1,$2::"MuscleGroup",$3::"MuscleRole",NOW())',[entry.id,m.muscleGroup,m.role]);
   const others=(await c.query('SELECT id,name,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',[entry.id])).rows;
   await c.query(sql);
   const first=(await c.query('SELECT id,name,"anatomyReview","updatedAt","biomechanicalReviewStatus" FROM "Exercise" WHERE id=$1',[entry.id])).rows[0];
   expect(first.name).toBe(entry.name);expect(first.anatomyReview).toEqual(review);
   const stored=(await c.query('SELECT "muscleGroup",role FROM "ExerciseMuscle" WHERE "exerciseId"=$1',[entry.id])).rows;
   expect(stored).toHaveLength(muscles.length);expect(stored).toEqual(expect.arrayContaining(muscles));
   await c.query(sql);expect((await c.query('SELECT id,name,"anatomyReview","updatedAt","biomechanicalReviewStatus" FROM "Exercise" WHERE id=$1',[entry.id])).rows[0]).toEqual(first);
   expect((await c.query('SELECT id,name,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',[entry.id])).rows).toEqual(others);
   // Same version plus a manual edit must not be mistaken for the exact automatic baseline.
   const manual={...(previous??review),notes:'Manual review to preserve'};
   await c.query('UPDATE "Exercise" SET name=$2,"anatomyReview"=$3::jsonb WHERE id=$1',[entry.id,oldName,JSON.stringify(manual)]);await c.query(sql);
   expect((await c.query('SELECT name,"anatomyReview" FROM "Exercise" WHERE id=$1',[entry.id])).rows[0]).toEqual({name:oldName,anatomyReview:manual});
   await c.query('UPDATE "Exercise" SET "anatomyReview"=$2::jsonb WHERE id=$1',[entry.id,previous?JSON.stringify(previous):null]);
   await c.query('UPDATE "ExerciseMuscle" SET role=\'SECONDARY\' WHERE "exerciseId"=$1 AND "muscleGroup"=\'BACK\'',[entry.id]);await c.query(sql);
   expect((await c.query('SELECT name FROM "Exercise" WHERE id=$1',[entry.id])).rows[0].name).toBe(oldName);
  }finally{await c.query('ROLLBACK');await c.end();}
 });
 it('preserves old global names as aliases and gives private exercises priority',async()=>{
  const globals=manifest.map(e=>({id:e.id,name:e.name,ownerUserId:null}));
  const custom={id:'custom',name:'Remada Curvada com Barra',ownerUserId:'athlete'};
  const find=vi.spyOn(prisma.exercise,'findMany').mockResolvedValue(globals as never);
  try{
   const names=['Remada Curvada com Barra','Remada Curvada com Barra ao Peito','Remada Pendlay'];
   const resolved=await resolveCanonicalExerciseMap({userId:'athlete',names});
   expect(resolved.get(names[0])).toBe('00000000-0000-4000-8000-000000000121');expect(resolved.get(names[1])).toBe('7f249b6a-85ad-45ca-9147-6cfa712547c7');expect(resolved.get(names[2])).toBe('1eef7876-e093-42af-8374-00d3b105c47a');
   find.mockResolvedValue([...globals,custom] as never);expect((await resolveCanonicalExerciseMap({userId:'athlete',names:[names[0]]})).get(names[0])).toBe(custom.id);
  }finally{find.mockRestore();}
 });
 it('serves every active variant through normal search and media instructions',async()=>{
  const user=await createTestUser();const created:string[]=[];
  try{
   for(const e of manifest.filter(e=>!('retired' in e && e.retired))){
    const review=ExerciseAnatomySchema.parse(read(e.anatomyFile)),coarse=REVIEWED_EXERCISES_BY_ID.get(e.id)!;
    const exercise=await prisma.exercise.create({data:{name:e.name,ownerUserId:user.id,anatomyReview:review,muscles:{create:[...coarse.primary.map(muscleGroup=>({muscleGroup,role:'PRIMARY' as const})),...coarse.secondary.map(muscleGroup=>({muscleGroup,role:'SECONDARY' as const}))]}}});created.push(exercise.id);
    for(const query of[e.name,'costas',review.aliases.at(-1)!])expect((await new ListExercises().execute({userId:user.id,query})).filter(r=>r.id===exercise.id)).toHaveLength(1);
    expect((await new GetExerciseMedia().execute({userId:user.id,exerciseId:exercise.id})).instructions).toEqual(review.instructions);
   }
  }finally{await prisma.exercise.deleteMany({where:{id:{in:created}}});await cleanupTestUsers([user.id]);}
 });
});
