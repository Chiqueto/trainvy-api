import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ExerciseAnatomySchema,
  getExerciseAnatomy,
} from "../../src/domain/exercise-anatomy.js";
import { prisma, getDatabaseUrl } from "../../src/lib/db.js";
import { ListExercises } from "../../src/usecases/ListExercises.js";
import { GetExerciseMedia } from "../../src/usecases/GetExerciseMedia.js";
import { cleanupTestUsers, createTestUser } from "../helpers/test-db.js";

const canonical = JSON.parse(
  readFileSync(
    new URL("../../src/domain/peck-deck-anatomy.json", import.meta.url),
    "utf8",
  ),
);
const review = ExerciseAnatomySchema.parse(canonical);
const muscles = review.participants.map((p) => ({
  muscleGroup: p.muscleGroup,
  role: p.role,
}));
const targetId = "b9859cd9-6ed6-4e63-8fd0-500e8cf8d553";

describe("detailed exercise anatomy", () => {
  it("validates the single-exercise review and rejects dangling sources, regions and changed classifications", () => {
    expect(getExerciseAnatomy(review, muscles)).toEqual(review);
    expect(review.participants[0].emphasizedRegionIds).toEqual([]);
    const source = structuredClone(review);
    source.participants[0].sourceIds = ["MISSING_SOURCE"];
    expect(ExerciseAnatomySchema.safeParse(source).success).toBe(false);
    const region = structuredClone(review);
    region.participants[0].emphasizedRegionIds = ["MISSING_REGION"];
    expect(ExerciseAnatomySchema.safeParse(region).success).toBe(false);
    expect(
      getExerciseAnatomy(review, [{ muscleGroup: "BACK", role: "PRIMARY" }]),
    ).toBeNull();
    expect(getExerciseAnatomy(null, muscles)).toBeNull();
  });

  it("applies the migration to its UUID only, is idempotent, and preserves the original row and muscles", async () => {
    // The shared resolver refuses production URLs under NODE_ENV=test.
    const client = new Client({ connectionString: getDatabaseUrl() });
    await client.connect();
    try {
      await client.query("BEGIN");
      const name =
        "Crucifixo na Máquina — aliases: peck deck, pec deck, voador";
      await client.query(
        'INSERT INTO "Exercise" (id,name,"isUnilateral","createdAt","updatedAt") VALUES ($1,$2,false,NOW(),NOW()) ON CONFLICT (id) DO NOTHING',
        [targetId, name],
      );
      const before = await client.query(
        'SELECT id,name,"ownerUserId","createdAt" FROM "Exercise" WHERE id=$1',
        [targetId],
      );
      const beforeMuscles = await client.query(
        'SELECT * FROM "ExerciseMuscle" WHERE "exerciseId"=$1 ORDER BY id',
        [targetId],
      );
      await client.query(
        'UPDATE "Exercise" SET "anatomyReview"=NULL WHERE id=$1',
        [targetId],
      );
      const unrelated = await client.query(
        'SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',
        [targetId],
      );
      const sql = readFileSync(
        new URL(
          "../../prisma/migrations/20261028140000_peck_deck_anatomy/migration.sql",
          import.meta.url,
        ),
        "utf8",
      )
        .replace(/^BEGIN;\s*$/m, "")
        .replace(/^COMMIT;\s*$/m, "");
      await client.query(sql);
      const first = (
        await client.query('SELECT * FROM "Exercise" WHERE id=$1', [targetId])
      ).rows[0];
      expect(first.anatomyReview).toEqual(review);
      expect(first).toMatchObject(before.rows[0]);
      await client.query(sql);
      const second = (
        await client.query('SELECT * FROM "Exercise" WHERE id=$1', [targetId])
      ).rows[0];
      expect(second).toEqual(first);
      expect(
        (
          await client.query(
            'SELECT * FROM "ExerciseMuscle" WHERE "exerciseId"=$1 ORDER BY id',
            [targetId],
          )
        ).rows,
      ).toEqual(beforeMuscles.rows);
      expect(
        (
          await client.query(
            'SELECT id,"updatedAt","anatomyReview" FROM "Exercise" WHERE id<>$1 ORDER BY id',
            [targetId],
          )
        ).rows,
      ).toEqual(unrelated.rows);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});

describe("anatomy catalog and media integration", () => {
  let userId: string,
    otherUserId: string,
    reviewedId: string,
    plainId: string,
    privateId: string;
  const created: string[] = [];
  beforeAll(async () => {
    userId = (await createTestUser()).id;
    otherUserId = (await createTestUser()).id;
    async function exercise(
      name: string,
      ownerUserId: string | null,
      detailed: boolean,
    ) {
      const row = await prisma.exercise.create({
        data: {
          name,
          ownerUserId,
          isUnilateral: false,
          ...(detailed ? { anatomyReview: review } : {}),
          muscles: { create: muscles },
        },
      });
      created.push(row.id);
      return row.id;
    }
    const suffix = crypto.randomUUID();
    reviewedId = await exercise(`Voador review ${suffix}`, null, true);
    plainId = await exercise(`Supino plain ${suffix}`, null, false);
    privateId = await exercise(`Private voador ${suffix}`, otherUserId, true);
  });
  afterAll(async () => {
    await prisma.exercise.deleteMany({ where: { id: { in: created } } });
    await cleanupTestUsers([userId, otherUserId].filter(Boolean));
  });
  it.each(["clavicular", "peitoral superior", "deltoide anterior", "voador"])(
    "finds %s without exposing other users' reviews",
    async (query) => {
      const rows = await new ListExercises().execute({ userId, query });
      expect(rows.filter((r) => r.id === reviewedId)).toHaveLength(1);
      expect(rows.some((r) => r.id === privateId)).toBe(false);
      expect(rows.find((r) => r.id === reviewedId)?.anatomy).toEqual(review);
    },
  );
  it("keeps broad peitoral searches inclusive of unreviewed chest exercises", async () => {
    const rows = await new ListExercises().execute({
      userId,
      query: "peitoral",
    });
    expect(rows.map((r) => r.id)).toEqual(
      expect.arrayContaining([reviewedId, plainId]),
    );
    expect(rows.find((r) => r.id === plainId)?.anatomy).toBeNull();
  });
  it("serves reviewed instructions without pretending a media asset exists and enforces ownership", async () => {
    const media = new GetExerciseMedia();
    expect(
      await media.execute({ userId, exerciseId: reviewedId }),
    ).toMatchObject({
      hasMedia: false,
      anatomy: review,
      instructions: review.instructions,
    });
    await expect(
      media.execute({ userId, exerciseId: privateId }),
    ).rejects.toThrow("Exercise not found");
  });
  it("invalidates stale anatomical detail after changing broad muscles", async () => {
    await prisma.exerciseMuscle.deleteMany({
      where: { exerciseId: reviewedId },
    });
    await prisma.exerciseMuscle.create({
      data: { exerciseId: reviewedId, muscleGroup: "BACK", role: "PRIMARY" },
    });
    const result = await new GetExerciseMedia().execute({
      userId,
      exerciseId: reviewedId,
    });
    expect(result.anatomy).toBeNull();
    expect(result.instructions).toBeNull();
    const rows = await new ListExercises().execute({
      userId,
      query: "clavicular",
    });
    expect(rows.some((r) => r.id === reviewedId)).toBe(false);
  });
});
