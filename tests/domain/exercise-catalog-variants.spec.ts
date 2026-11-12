import "dotenv/config";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import variants from "../../src/domain/exercise-catalog-variants.json" with { type: "json" };
import { REVIEWED_EXERCISES, REVIEWED_EXERCISES_BY_ID } from "../../src/domain/exercise-catalog-review.js";

const sql = readFileSync(new URL("../../prisma/migrations/20261112120000_expand_equipment_variants/migration.sql", import.meta.url), "utf8");

async function testClient() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Dedicated TEST_DATABASE_URL required");
  const target = new URL(url), primary = new URL(process.env.DATABASE_URL!);
  if (target.host === primary.host && target.pathname === primary.pathname) throw new Error("Separate test database required");
  const client = new Client({ connectionString: url });
  await client.connect();
  // Connection-local tables: migrations never touch application tables.
  await client.query(`
    DROP TABLE IF EXISTS pg_temp."ExerciseMuscle";
    DROP TABLE IF EXISTS pg_temp."Exercise";
    CREATE TEMP TABLE "Exercise" (id text PRIMARY KEY, name text NOT NULL, "ownerUserId" text, "isUnilateral" boolean DEFAULT false, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now());
    CREATE TEMP TABLE "ExerciseMuscle" (id text PRIMARY KEY, "exerciseId" text REFERENCES "Exercise", "muscleGroup" text, role text, "createdAt" timestamptz, UNIQUE("exerciseId","muscleGroup"));
  `);
  return client;
}

describe("Equipment variant catalog", () => {
  it("covers requested triceps and curl variations with distinct identities and classifications", () => {
    for (const name of [
      "Tríceps Testa com Barra Reta", "Tríceps Testa com Barra W", "Tríceps Testa com Halteres",
      "Tríceps Testa na Polia com Barra Reta", "Tríceps Testa na Polia com Corda",
      "Rosca Scott com Barra W", "Rosca Scott Unilateral com Halter", "Rosca Scott Unilateral na Polia",
      "Rosca Martelo na Polia com Corda", "Rosca Bayesian Unilateral na Polia",
    ]) expect(variants.find(v => v.name === name)).toBeDefined();
    expect(new Set(REVIEWED_EXERCISES.map(v => v.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())).size).toBe(REVIEWED_EXERCISES.length);
    for (const v of variants) {
      expect(REVIEWED_EXERCISES_BY_ID.get(v.id)?.primary).toEqual(v.primary);
      expect(v.primary.length).toBeGreaterThan(0);
      expect(v.primary.some(m => v.secondary.includes(m))).toBe(false);
      if (v.name.includes("Unilateral")) expect(v.isUnilateral).toBe(true);
    }
    const literal = /jsonb_array_elements\('(.+)'::jsonb\)/.exec(sql)?.[1];
    expect(JSON.parse(literal!.replaceAll("''", "'"))).toEqual(variants);
  });

  it("adds classified globals once, preserves manual data and ignores custom name collisions", async () => {
    const client = await testClient();
    try {
      const existing = variants[0], custom = variants[1];
      await client.query('INSERT INTO "Exercise" (id,name,"isUnilateral","updatedAt") VALUES ($1,$2,true,\'2026-01-01\')', [existing.id, existing.name]);
      await client.query('INSERT INTO "ExerciseMuscle" VALUES (\'manual\',$1,\'CORE\',\'PRIMARY\',now())', [existing.id]);
      await client.query('INSERT INTO "Exercise" (id,name,"ownerUserId") VALUES (\'custom\',$1,\'owner\')', [custom.name]);
      const before = (await client.query('SELECT * FROM "Exercise" ORDER BY id')).rows;
      await client.query(sql);
      const after = (await client.query('SELECT * FROM "Exercise" ORDER BY id')).rows;
      expect(after).toHaveLength(variants.length + 1);
      expect(after.filter(e => before.some(b => b.id === e.id))).toEqual(before);
      const muscles = (await client.query('SELECT "exerciseId","muscleGroup",role FROM "ExerciseMuscle" ORDER BY "exerciseId","muscleGroup"')).rows;
      for (const v of variants.filter(v => v.id !== existing.id)) {
        expect(muscles.filter(m => m.exerciseId === v.id).map(m => `${m.role}:${m.muscleGroup}`).sort()).toEqual([
          ...v.primary.map(m => `PRIMARY:${m}`), ...v.secondary.map(m => `SECONDARY:${m}`),
        ].sort());
      }
      await client.query(sql);
      expect((await client.query('SELECT * FROM "Exercise" ORDER BY id')).rows).toEqual(after);
      expect((await client.query('SELECT "exerciseId","muscleGroup",role FROM "ExerciseMuscle" ORDER BY "exerciseId","muscleGroup"')).rows).toEqual(muscles);
    } finally {
      await client.query("ROLLBACK");
      await client.query('DROP TABLE pg_temp."ExerciseMuscle"; DROP TABLE pg_temp."Exercise"');
      await client.end();
    }
  });

  it("rejects an ID owned by a user before inserting any global variant", async () => {
    const client = await testClient();
    try {
      await client.query('INSERT INTO "Exercise" (id,name,"ownerUserId") VALUES ($1,$2,\'owner\')', [variants[0].id, variants[0].name]);
      await expect(client.query(sql)).rejects.toThrow("Variant ID collision");
      await client.query("ROLLBACK");
      expect((await client.query('SELECT count(*)::int AS count FROM "Exercise"')).rows[0].count).toBe(1);
    } finally {
      await client.query("ROLLBACK");
      await client.query('DROP TABLE pg_temp."ExerciseMuscle"; DROP TABLE pg_temp."Exercise"');
      await client.end();
    }
  });
});
