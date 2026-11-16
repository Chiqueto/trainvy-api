import { readdirSync,readFileSync } from "node:fs";

import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";

import { getCanonicalGlobalByName } from "../../src/domain/canonical-catalog.js";
import { resolveCanonicalExerciseMap } from "../../src/domain/canonical-exercise.js";
import { anatomySearchTerms, ExerciseAnatomySchema, getExerciseAnatomy } from "../../src/domain/exercise-anatomy.js";
import { REVIEWED_EXERCISES_BY_ID } from "../../src/domain/exercise-catalog-review.js";
import { getDatabaseUrl, prisma } from "../../src/lib/db.js";
import { ListExercises } from "../../src/usecases/ListExercises.js";
const migrations = new URL('../../prisma/migrations/',import.meta.url);
const slugs=['bent-row','generic-bent-row','one-arm-row','cable-row','machine-row','lat-pulldown','front-lat-pulldown','supinated-bent-row','high-bent-row'];
const ids=['00000000-0000-4000-8000-000000000121','00000000-0000-4000-8000-000000000122','00000000-0000-4000-8000-000000000138','120f29ac-733c-478b-8aa9-a3f4c22f5e70','43025392-0466-46e7-82ab-27888d53f929','00000000-0000-4000-8000-000000000119','00000000-0000-4000-8000-000000000120','1444333f-9fb0-4d74-843a-42b9480e5cfc','7f249b6a-85ad-45ca-9147-6cfa712547c7'];
const read=(name:string)=>JSON.parse(readFileSync(new URL('../../src/domain/'+name,import.meta.url),'utf8'));
describe('row variants and scapular review delivery',()=>{
  it.each(slugs)('%s validates the delivery, search terms and scoped migration without altering manual reviews',async slug=>{
    const i=slugs.indexOf(slug),id=ids[i],entry=REVIEWED_EXERCISES_BY_ID.get(id)!;
    const review=ExerciseAnatomySchema.parse(read(slug+(i<7?'-scapular-anatomy.json':'-anatomy.json')));
    const muscles=[...entry.primary.map(muscleGroup=>({muscleGroup,role:'PRIMARY' as const})),...entry.secondary.map(muscleGroup=>({muscleGroup,role:'SECONDARY' as const}))];
    expect(getExerciseAnatomy(review,muscles)).toEqual(review);
    expect(anatomySearchTerms(review)).toContain('Serrátil anterior');
    const dir=readdirSync(migrations).find(d=>d.startsWith('2026111615')&&d.endsWith(slug.replaceAll('-','_')+'_scapular'))!;
    const sql=readFileSync(new URL(dir+'/migration.sql',migrations),'utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
    const payload=/SET "anatomyReview"='(.+?)'::jsonb/.exec(sql)![1].replaceAll("''", "'");
    expect(JSON.parse(payload)).toEqual(review);
    const historicalName = /AND name='([^']+)'/.exec(sql)?.[1] ?? /VALUES \('[^']+','([^']+)'/.exec(sql)?.[1] ?? entry.name;
    const c=new Client({connectionString:getDatabaseUrl()});await c.connect();
    try{
      await c.query('BEGIN');
      await c.query('INSERT INTO "Exercise" (id,name,"isUnilateral","createdAt","updatedAt") VALUES ($1,$2,false,NOW(),NOW()) ON CONFLICT (id) DO NOTHING',[id,historicalName]);
      const old=i<7?read(slug+'-anatomy.json'):null;
      await c.query('UPDATE "Exercise" SET name=$2,"ownerUserId"=NULL,"anatomyReview"=$3::jsonb,"updatedAt"=\'2000-01-01\' WHERE id=$1',[id,historicalName,old?JSON.stringify(old):null]);
      await c.query('DELETE FROM "ExerciseMuscle" WHERE "exerciseId"=$1',[id]);
      if(i<7)for(const m of muscles)await c.query('INSERT INTO "ExerciseMuscle" (id,"exerciseId","muscleGroup",role,"createdAt") VALUES (gen_random_uuid()::text,$1,$2::"MuscleGroup",$3::"MuscleRole",NOW())',[id,m.muscleGroup,m.role]);
      const others=(await c.query('SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',[id])).rows;
      await c.query(sql);
      const first=(await c.query('SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[id])).rows[0];expect(first.anatomyReview).toEqual(review);
      await c.query(sql);expect((await c.query('SELECT "anatomyReview","updatedAt" FROM "Exercise" WHERE id=$1',[id])).rows[0]).toEqual(first);
      expect((await c.query('SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',[id])).rows).toEqual(others);
      // Even a manual revision retaining the previous version string is protected by full payload comparison.
      const manual={...(old??review),notes:'Revisão manual preservada'};
      await c.query('UPDATE "Exercise" SET "anatomyReview"=$2::jsonb WHERE id=$1',[id,JSON.stringify(manual)]);await c.query(sql);
      expect((await c.query('SELECT "anatomyReview" FROM "Exercise" WHERE id=$1',[id])).rows[0].anatomyReview).toEqual(manual);
      await c.query('UPDATE "Exercise" SET "anatomyReview"=$2::jsonb,name=\'Outro movimento\' WHERE id=$1',[id,old?JSON.stringify(old):null]);
      if(i<7){await c.query(sql);expect((await c.query('SELECT "anatomyReview" FROM "Exercise" WHERE id=$1',[id])).rows[0].anatomyReview).toEqual(old);}
      else {await c.query('SAVEPOINT identity');await expect(c.query(sql)).rejects.toThrow(/identity changed/);await c.query('ROLLBACK TO SAVEPOINT identity');}
    }finally{await c.query('ROLLBACK');await c.end();}
  });
  it('retains the historical ID while excluding the duplicate from new selections and respecting custom ownership',async()=>{
    const row=(id:string,name:string,ownerUserId:string|null)=>({id,name,ownerUserId,isUnilateral:false,anatomyReview:null,muscles:[],media:[]});
    const canonical=row(ids[0],'Remada Curvada com Barra',null),legacy=row(ids[1],'Remada Curvada',null),custom=row('custom','Remada Curvada','athlete');
    const find=vi.spyOn(prisma.exercise,'findMany').mockResolvedValue([canonical,legacy,custom] as never);
    const sessions=vi.spyOn(prisma.sessionExercise,'findMany').mockResolvedValue([{exerciseId:ids[1]}] as never);
    try{
      const choices=await new ListExercises().execute({userId:'athlete'});
      expect(choices.map(e=>e.id)).toEqual(expect.arrayContaining([canonical.id,custom.id]));expect(choices.some(e=>e.id===legacy.id)).toBe(false);
      find.mockResolvedValue([legacy] as never);
      expect((await new ListExercises().execute({userId:'athlete',onlyWithHistory:true}))[0].id).toBe(legacy.id);
      find.mockResolvedValue([canonical,legacy] as never);
      expect((await resolveCanonicalExerciseMap({userId:'athlete',names:['Remada Curvada']})).get('Remada Curvada')).toBe(canonical.id);
      find.mockResolvedValue([canonical,legacy,custom] as never);
      expect((await resolveCanonicalExerciseMap({userId:'athlete',names:['Remada Curvada']})).get('Remada Curvada')).toBe(custom.id);
      expect(getCanonicalGlobalByName('Remada Curvada')?.id).toBe(canonical.id);
    }finally{find.mockRestore();sessions.mockRestore();}
  });
});
