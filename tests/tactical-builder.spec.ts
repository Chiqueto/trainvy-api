import { randomUUID } from "node:crypto";

import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { afterAll, describe, expect, it, vi } from "vitest";

import { prisma } from "../src/lib/db.js";
import { meRoutes } from "../src/routes/me.js";
import { WorkoutExerciseSchema } from "../src/schemas/index.js";
import { CreateWorkoutPlan } from "../src/usecases/CreateWorkoutPlan.js";
import { DuplicateWorkoutPlan } from "../src/usecases/DuplicateWorkoutPlan.js";
import {
  EditWorkoutPlan,
  GetEditableWorkoutPlan,
} from "../src/usecases/EditWorkoutPlan.js";

const identity = vi.hoisted(() => ({ userId: "" }));
vi.mock("../src/lib/auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () =>
        identity.userId ? { user: { id: identity.userId } } : null,
      ),
    },
  },
}));
const userIds: string[] = [];
async function user() {
  const id = randomUUID();
  userIds.push(id);
  await prisma.user.create({
    data: { id, name: "Builder test", email: `${id}@example.test` },
  });
  return id;
}
afterAll(async () => {
  const plans = await prisma.workoutPlan.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const days = await prisma.workoutDay.findMany({
    where: { workoutPlanId: { in: plans.map((p) => p.id) } },
    select: { id: true },
  });
  await prisma.workoutExercise.deleteMany({
    where: { workoutDayId: { in: days.map((d) => d.id) } },
  });
  await prisma.workoutDay.deleteMany({
    where: { id: { in: days.map((d) => d.id) } },
  });
  await prisma.workoutPlan.deleteMany({
    where: { id: { in: plans.map((p) => p.id) } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("Tactical prescription persistence", () => {
  it("rejects invalid runes, loads and zones without breaking legacy payloads", () => {
    const base = {
      order: 0,
      name: "Supino",
      sets: 1,
      reps: 10,
      restTimeInSeconds: 75,
    };
    expect(WorkoutExerciseSchema.safeParse(base).success).toBe(true);
    for (const runeConfig of [
      { DROP_SET: 4 },
      { REST_PAUSE: 7 },
      { ISOMETRIC_HOLD: "unknown" },
      { UNKNOWN: 1 },
    ]) {
      expect(
        WorkoutExerciseSchema.safeParse({ ...base, runeConfig }).success,
      ).toBe(false);
    }
    expect(
      WorkoutExerciseSchema.safeParse({ ...base, runes: ["UNKNOWN"] }).success,
    ).toBe(false);
    expect(
      WorkoutExerciseSchema.safeParse({
        ...base,
        setPrescription: [{ reps: 10, zone: "unknown", restSeconds: 75 }],
      }).success,
    ).toBe(false);
    expect(
      WorkoutExerciseSchema.safeParse({
        ...base,
        setPrescription: [
          { reps: 10, zone: "hypertrophy", restSeconds: 75, load: -1 },
        ],
      }).success,
    ).toBe(false);
  });
  it("persists create, edit, reload and duplication with group and distinct per-set doses", async () => {
    const userId = await user();
    const group = randomUUID();
    const setPrescription = [
      { reps: 10, zone: "hypertrophy" as const, restSeconds: 75, load: 12.5 },
      { reps: 8, zone: "strength" as const, restSeconds: 120 },
    ];
    const created = await new CreateWorkoutPlan().execute({
      userId,
      name: "Tactical",
      activate: false,
      workoutDays: [
        {
          name: "Treino A",
          isRest: false,
          estimatedDurationInSeconds: 1200,
          exercises: ["Supino teste", "Remada teste"].map((name, order) => ({
            name,
            order,
            sets: 2,
            reps: 10,
            restTimeInSeconds: 75,
            supersetGroupId: group,
            runes: ["DROP_SET"],
            runeConfig: { DROP_SET: 3 },
            setPrescription,
          })),
        },
      ],
    });
    const plan = await new GetEditableWorkoutPlan().execute(userId, created.id);
    expect(plan.workoutDays[0].exercises[0]).toMatchObject({
      supersetGroupId: group,
      runes: ["DROP_SET"],
      runeConfig: { DROP_SET: 3 },
      setPrescription,
    });
    await new EditWorkoutPlan().execute(userId, created.id, {
      name: "Classic edit",
      workoutDays: plan.workoutDays.map((d) => ({
        ...d,
        exercises: d.exercises.map((e) => ({
          ...e,
          runes: ["REST_PAUSE"] as const as ["REST_PAUSE"],
          runeConfig: { REST_PAUSE: 20 as const },
        })),
      })),
    });
    const reopened = await new GetEditableWorkoutPlan().execute(
      userId,
      created.id,
    );
    expect(reopened.workoutDays[0].exercises[0]).toMatchObject({
      supersetGroupId: group,
      runes: ["REST_PAUSE"],
      runeConfig: { REST_PAUSE: 20 },
      setPrescription,
    });
    const copy = await new DuplicateWorkoutPlan().execute({
      userId,
      workoutPlanId: created.id,
    });
    const duplicated = await new GetEditableWorkoutPlan().execute(
      userId,
      copy.id,
    );
    expect(duplicated.workoutDays[0].exercises[0]).toMatchObject({
      supersetGroupId: group,
      runes: ["REST_PAUSE"],
      runeConfig: { REST_PAUSE: 20 },
      setPrescription,
    });
    await expect(
      new GetEditableWorkoutPlan().execute(await user(), created.id),
    ).rejects.toThrow();
  });
  it("scopes builder preferences to the authenticated user and rejects foreign user ids", async () => {
    const a = await user(),
      b = await user();
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(meRoutes, { prefix: "/me" });
    identity.userId = a;
    expect(
      (
        await app.inject({ method: "GET", url: "/me/builder-preferences" })
      ).json(),
    ).toEqual({ preferredBuilderMode: "tactical" });
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/me/builder-preferences",
          payload: { preferredBuilderMode: "classic", userId: b },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/me/builder-preferences",
          payload: { preferredBuilderMode: "classic" },
        })
      ).statusCode,
    ).toBe(200);
    identity.userId = b;
    expect(
      (
        await app.inject({ method: "GET", url: "/me/builder-preferences" })
      ).json(),
    ).toEqual({ preferredBuilderMode: "tactical" });
    identity.userId = a;
    expect(
      (
        await app.inject({ method: "GET", url: "/me/builder-preferences" })
      ).json(),
    ).toEqual({ preferredBuilderMode: "classic" });
    identity.userId = "";
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/me/builder-preferences",
          payload: { preferredBuilderMode: "classic" },
        })
      ).statusCode,
    ).toBe(401);
    await app.close();
  });
});
