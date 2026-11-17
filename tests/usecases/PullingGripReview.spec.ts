import {readdirSync,readFileSync} from 'node:fs';

import {Client} from 'pg';
import {describe,expect,it,vi} from 'vitest';

import {resolveCanonicalExerciseMap} from '../../src/domain/canonical-exercise.js';
import {ExerciseAnatomySchema,getExerciseAnatomy} from '../../src/domain/exercise-anatomy.js';
import {REVIEWED_EXERCISES_BY_ID} from '../../src/domain/exercise-catalog-review.js';
import reviews from '../../src/domain/pulling-grip-reviews.json' with {type:'json'};
import {getDatabaseUrl,prisma} from '../../src/lib/db.js';
import {GetExerciseMedia} from '../../src/usecases/GetExerciseMedia.js';
import {ListExercises} from '../../src/usecases/ListExercises.js';
import {cleanupTestUsers,createTestUser} from '../helpers/test-db.js';
const read=(f:string)=>JSON.parse(readFileSync(new URL('../../src/domain/'+f,import.meta.url),'utf8'));
describe('pulldown identity and abdominal triangle grip review',()=>{
 it.each(reviews)('$slug persists only its exact known baseline and preserves manual reviews',async entry=>{
  const review=ExerciseAnatomySchema.parse(read(entry.anatomyFile)),old=read(entry.previous),catalog=REVIEWED_EXERCISES_BY_ID.get(entry.id)!;
  const muscles=[...catalog.primary.map(muscleGroup=>({muscleGroup,role:'PRIMARY'})),...catalog.secondary.map(muscleGroup=>({muscleGroup,role:'SECONDARY'}))];
  expect(getExerciseAnatomy(review,muscles)).toEqual(review);
  const root=new URL('../../prisma/migrations/',import.meta.url),folder=readdirSync(root).find(f=>f.startsWith('2026111711')&&f.endsWith(entry.slug.replaceAll('-','_')+'_grip'))!;
  const sql=readFileSync(new URL(folder+'/migration.sql',root),'utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
  expect(JSON.parse(/"anatomyReview"='(.+?)'::jsonb/.exec(sql)![1].replaceAll("''","'"))).toEqual(review);
  const c=new Client({connectionString:getDatabaseUrl()});await c.connect();
  try{
   await c.query('BEGIN');
   await c.query('INSERT INTO "Exercise" (id,name,"isUnilateral","createdAt","updatedAt") VALUES($1,$2,false,NOW(),NOW()) ON CONFLICT(id) DO NOTHING',[entry.id,entry.oldName]);
   await c.query('UPDATE "Exercise" SET name=$2,"ownerUserId"=NULL,"anatomyReview"=$3::jsonb,"updatedAt"=\'2000-01-01\' WHERE id=$1',[entry.id,entry.oldName,JSON.stringify(old)]);
   await c.query('DELETE FROM "ExerciseMuscle" WHERE "exerciseId"=$1',[entry.id]);
   for(const m of muscles)await c.query('INSERT INTO "ExerciseMuscle"(id,"exerciseId","muscleGroup",role,"createdAt") VALUES(gen_random_uuid()::text,$1,$2::"MuscleGroup",$3::"MuscleRole",NOW())',[entry.id,m.muscleGroup,m.role]);
   const others=(await c.query('SELECT id,name,"anatomyReview","updatedAt" FROM "Exercise" WHERE id<>$1 ORDER BY id',[entry.id])).rows;
   await c.query(sql);const first=(await c.query('SELECT name,"anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[entry.id])).rows[0];
   expect(first.name).toBe(entry.name);expect(first.anatomyReview).toEqual(review);
   await c.query(sql);expect((await c.query('SELECT name,"anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[entry.id])).rows[0]).toEqual(first);
   expect((await c.query('SELECT id,name,"anatomyReview","updatedAt" FROM "Exercise" WHERE id<>$1 ORDER BY id',[entry.id])).rows).toEqual(others);
   const manual={...old,notes:'Manual data preserved'};await c.query('UPDATE "Exercise" SET name=$2,"anatomyReview"=$3::jsonb WHERE id=$1',[entry.id,entry.oldName,JSON.stringify(manual)]);await c.query(sql);
   expect((await c.query('SELECT "anatomyReview" FROM "Exercise" WHERE id=$1',[entry.id])).rows[0].anatomyReview).toEqual(manual);
  }finally{await c.query('ROLLBACK');await c.end();}
 });
 it('offers one cable pulldown while retaining historical lookup and custom ownership',async()=>{
  const row=(id:string,name:string,ownerUserId:string|null)=>({id,name,ownerUserId,isUnilateral:false,anatomyReview:null,muscles:[],media:[]});
  const canonical=row(reviews[0].id,reviews[0].name,null),legacy=row(reviews[1].id,reviews[1].name,null),custom=row('custom','Puxada Frontal','athlete');
  const find=vi.spyOn(prisma.exercise,'findMany').mockResolvedValue([canonical,legacy] as never),sessions=vi.spyOn(prisma.sessionExercise,'findMany').mockResolvedValue([{exerciseId:legacy.id}] as never);
  try{
   expect((await new ListExercises().execute({userId:'athlete'})).map(e=>e.id)).toEqual([canonical.id]);
   find.mockResolvedValue([legacy] as never);expect((await new ListExercises().execute({userId:'athlete',onlyWithHistory:true}))[0].id).toBe(legacy.id);
   find.mockResolvedValue([canonical,legacy] as never);expect((await resolveCanonicalExerciseMap({userId:'athlete',names:['Puxada Frontal']})).get('Puxada Frontal')).toBe(canonical.id);
   find.mockResolvedValue([canonical,legacy,custom] as never);expect((await resolveCanonicalExerciseMap({userId:'athlete',names:['Puxada Frontal']})).get('Puxada Frontal')).toBe(custom.id);
  }finally{find.mockRestore();sessions.mockRestore();}
 });
 it('delivers the reviewed instructions and search aliases through the regular API flows',async()=>{
  const user=await createTestUser(),created:string[]=[];
  try{
   for(const e of reviews.filter(e=>!('retired' in e&&e.retired))){
    const review=ExerciseAnatomySchema.parse(read(e.anatomyFile)),catalog=REVIEWED_EXERCISES_BY_ID.get(e.id)!;
    const exercise=await prisma.exercise.create({data:{name:e.name,ownerUserId:user.id,anatomyReview:review,muscles:{create:[...catalog.primary.map(muscleGroup=>({muscleGroup,role:'PRIMARY' as const})),...catalog.secondary.map(muscleGroup=>({muscleGroup,role:'SECONDARY' as const}))]}}});created.push(exercise.id);
    expect((await new ListExercises().execute({userId:user.id,query:e.oldName})).some(r=>r.id===exercise.id)).toBe(true);
    expect((await new GetExerciseMedia().execute({userId:user.id,exerciseId:exercise.id})).instructions).toEqual(review.instructions);
   }
  }finally{await prisma.exercise.deleteMany({where:{id:{in:created}}});await cleanupTestUsers([user.id]);}
 });
});
