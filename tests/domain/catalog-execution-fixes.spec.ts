import "dotenv/config";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { ExerciseAnatomySchema } from "../../src/domain/exercise-anatomy.js";
import { getCanonicalGlobalByName } from "../../src/domain/canonical-catalog.js";

const load = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = load("../../prisma/migrations/20261028180000_catalog_identity_and_execution_fixes/migration.sql").replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
describe("catalog identity and execution fixes", () => {
  it("validates each detailed review and keeps legacy exact-name resolution", () => {
    for (const name of ["machine-chest-press", "flat-dumbbell-fly", "machine-fly", "peck-deck"]) {
      expect(() => ExerciseAnatomySchema.parse(JSON.parse(load(`../../src/domain/${name}-anatomy.json`)))).not.toThrow();
    }
    for (const review of Object.values(JSON.parse(load("../../src/domain/cable-crossover-anatomy.json"))))
      expect(() => ExerciseAnatomySchema.parse(review)).not.toThrow();
    expect(getCanonicalGlobalByName("Supino Reto")?.name).toBe("Supino Reto com Barra");
    expect(getCanonicalGlobalByName("Agachamento")?.name).toBe("Agachamento Livre");
    expect(getCanonicalGlobalByName("Supino Reto com Halteres")).toBeUndefined();
  });
  it("merges all historical references without changing snapshots, loads or custom exercises, and is repeatable", async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) throw new Error("Dedicated TEST_DATABASE_URL required");
    const target = new URL(testUrl), primary = new URL(process.env.DATABASE_URL!);
    if (target.host === primary.host && target.pathname === primary.pathname) throw new Error("Separate test database required");
    const client = new Client({ connectionString: testUrl });
    await client.connect();
    try {
      await client.query("BEGIN");
      // Connection-local tables shadow real tables. All writes roll back.
      await client.query(`
        CREATE TEMP TABLE "Exercise" (id text PRIMARY KEY, name text NOT NULL, "ownerUserId" text, "isUnilateral" boolean DEFAULT false, "anatomyReview" jsonb, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()) ON COMMIT DROP;
        CREATE TEMP TABLE "ExerciseMuscle" (id text, "exerciseId" text REFERENCES "Exercise" ON DELETE CASCADE, "muscleGroup" text, role text, "createdAt" timestamptz, UNIQUE("exerciseId","muscleGroup")) ON COMMIT DROP;
        CREATE TEMP TABLE "ExerciseMedia" (id text, "exerciseId" text REFERENCES "Exercise" ON DELETE CASCADE, provider text, "mediaType" text, UNIQUE("exerciseId",provider,"mediaType")) ON COMMIT DROP;
        CREATE TEMP TABLE "WorkoutExercise" (id text, "exerciseId" text REFERENCES "Exercise", "alternative1ExerciseId" text REFERENCES "Exercise", "alternative2ExerciseId" text REFERENCES "Exercise", name text) ON COMMIT DROP;
        CREATE TEMP TABLE "SessionExercise" (id text, "exerciseId" text REFERENCES "Exercise", "plannedExerciseId" text REFERENCES "Exercise", "alternative1ExerciseId" text REFERENCES "Exercise", "alternative2ExerciseId" text REFERENCES "Exercise", "exerciseNameSnapshot" text) ON COMMIT DROP;
        CREATE TEMP TABLE "WorkoutSet" (id text, "exerciseId" text REFERENCES "Exercise", load numeric, reps integer) ON COMMIT DROP;
        CREATE TEMP TABLE "WorkoutSetProposal" (id text, "targetExerciseId" text REFERENCES "Exercise") ON COMMIT DROP;
      `);
      for (const [suffix,name] of [["101","Supino Reto com Barra"],["102","Supino Reto"],["105","Agachamento Livre"],["106","Agachamento"]]) {
        await client.query('INSERT INTO "Exercise" (id,name) VALUES ($1,$2)', [`00000000-0000-4000-8000-000000000${suffix}`, name]);
      }
      await client.query(`INSERT INTO "Exercise" (id,name,"ownerUserId") VALUES ('custom','Agachamento','owner');`);
      for (const [source,targetId] of [["102","101"],["106","105"]]) {
        const id=`00000000-0000-4000-8000-000000000${source}`;
        await client.query('INSERT INTO "WorkoutExercise" VALUES ($1,$1,$1,$1,$2)',[id,'Original prescription']);
        await client.query('INSERT INTO "SessionExercise" VALUES ($1,$1,$1,$1,$1,$2)',[id,'Original snapshot']);
        await client.query('INSERT INTO "WorkoutSet" VALUES ($1,$1,80,12)',[id]);
        await client.query('INSERT INTO "WorkoutSetProposal" VALUES ($1,$1)',[id]);
        await client.query('INSERT INTO "ExerciseMedia" VALUES ($1,$1,$2,$3)',[id,'REPDB','IMAGE_SEQUENCE']);
      }
      await client.query(sql);
      await client.query(sql);
      for (const table of ["WorkoutExercise","SessionExercise","WorkoutSet","WorkoutSetProposal","ExerciseMedia"]) {
        const rows=(await client.query(`SELECT * FROM "${table}" ORDER BY id`)).rows;
        expect(rows).toHaveLength(2);
        for (const row of rows) {
          const expected=row.id.endsWith('102')?'00000000-0000-4000-8000-000000000101':'00000000-0000-4000-8000-000000000105';
          for (const [key,value] of Object.entries(row)) if(key.endsWith('ExerciseId')||key==='exerciseId') expect(value).toBe(expected);
        }
      }
      expect((await client.query('SELECT load::text,reps FROM "WorkoutSet"')).rows).toEqual([{load:'80',reps:12},{load:'80',reps:12}]);
      expect((await client.query('SELECT "exerciseNameSnapshot" FROM "SessionExercise"')).rows.every(r=>r.exerciseNameSnapshot==='Original snapshot')).toBe(true);
      expect((await client.query('SELECT name,"ownerUserId" FROM "Exercise" WHERE id=\'custom\'')).rows[0]).toEqual({name:'Agachamento',ownerUserId:'owner'});
      const fly=(await client.query('SELECT * FROM "Exercise" WHERE name=\'Crucifixo na Máquina\'')).rows[0];
      expect(ExerciseAnatomySchema.parse(fly.anatomyReview).variant).toContain('pegadores');
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
