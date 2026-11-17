import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { addDays } from "../../src/domain/analytics-dates.js";
import { auth } from "../../src/lib/auth.js";
import { prisma } from "../../src/lib/db.js";
import { historyRoutes } from "../../src/routes/history.js";
import { currentWeekRange } from "../../src/usecases/GetCurrentTrainingWeek.js";
import {
  cleanupTestUsers,
  createTestExercise,
  createTestSessionExercise,
  createTestUser,
  createTestWorkoutSession,
  createTestWorkoutSet,
} from "../helpers/test-db.js";

describe("Current training week", () => {
  const app = Fastify();
  const users: string[] = [];
  beforeAll(async () => {
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(historyRoutes, { prefix: "/history" });
    await app.ready();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestUsers(users);
    users.length = 0;
  });
  afterAll(async () => {
    await app.close();
  });
  const url = "/history/analytics/current-week?tz=America/Sao_Paulo";

  it("uses Sunday–Saturday in the athlete's timezone, including year transitions", () => {
    expect(
      currentWeekRange("America/Sao_Paulo", new Date("2026-11-15T02:59:59Z")),
    ).toEqual({ startDate: "2026-11-08", endDate: "2026-11-14" });
    expect(
      currentWeekRange("America/Sao_Paulo", new Date("2026-11-15T03:00:00Z")),
    ).toEqual({ startDate: "2026-11-15", endDate: "2026-11-21" });
    expect(
      currentWeekRange("America/Sao_Paulo", new Date("2027-01-01T12:00:00Z")),
    ).toEqual({ startDate: "2026-12-27", endDate: "2027-01-02" });
  });
  it("requires authentication", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
  });
  it("rejects invalid timezones", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: { id: "test" },
    } as never);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/history/analytics/current-week?tz=invalid",
        })
      ).statusCode,
    ).toBe(400);
  });
  it("isolates athletes, respects local boundaries and substitutions, and never fabricates missing data", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a.id, b.id);
    vi.spyOn(auth.api, "getSession").mockResolvedValue({ user: a } as never);
    const { startDate, endDate } = currentWeekRange("America/Sao_Paulo");
    const start = new Date(`${startDate}T03:00:00Z`);
    const next = new Date(`${addDays(endDate, 1)}T03:00:00Z`);
    const exercise = await createTestExercise({
      name: "Week test",
      ownerUserId: a.id,
    });
    const replacement = await createTestExercise({
      name: "Replacement",
      ownerUserId: a.id,
    });
    await prisma.exerciseMuscle.createMany({
      data: [
        { exerciseId: exercise.id, muscleGroup: "CHEST", role: "PRIMARY" },
        { exerciseId: exercise.id, muscleGroup: "TRICEPS", role: "SECONDARY" },
        { exerciseId: replacement.id, muscleGroup: "BACK", role: "PRIMARY" },
      ],
    });
    const session = await createTestWorkoutSession(null, {
      athleteId: a.id,
      startedAt: new Date(start.getTime() - 60000),
      completedAt: start,
    });
    const se = await createTestSessionExercise(session.id, {
      exerciseId: exercise.id,
    });
    await createTestWorkoutSet(se.id, {
      order: 1,
      reps: 5,
      weightInGrams: 20000,
      completedAt: start,
    });
    const substituted = await createTestWorkoutSet(se.id, {
      order: 2,
      reps: 15,
      weightInGrams: 10000,
      completedAt: start,
    });
    await prisma.workoutSet.update({
      where: { id: substituted.id },
      data: { exerciseId: replacement.id },
    });
    await createTestWorkoutSet(se.id, {
      order: 3,
      type: "WARMUP",
      reps: 10,
      completedAt: start,
    });
    await createTestWorkoutSet(se.id, {
      order: 4,
      reps: 10,
      completedAt: null,
    });
    const unknown = await createTestSessionExercise(session.id, {
      exerciseId: null,
    });
    await createTestWorkoutSet(unknown.id, {
      order: 1,
      reps: null,
      weightInGrams: null,
      completedAt: start,
    });
    // Exactly before the first Sunday, exactly at the following Sunday, another athlete and unfinished sessions are excluded.
    for (const [athleteId, completedAt] of [
      [a.id, new Date(start.getTime() - 1)],
      [a.id, next],
      [b.id, start],
      [a.id, null],
    ] as const) {
      const excluded = await createTestWorkoutSession(null, {
        athleteId,
        startedAt: start,
        completedAt,
      });
      const entry = await createTestSessionExercise(excluded.id, {
        exerciseId: exercise.id,
      });
      await createTestWorkoutSet(entry.id, {
        order: 1,
        reps: 10,
        weightInGrams: 90000,
        completedAt: start,
      });
    }
    // A session at Saturday's last millisecond still counts, even with no sets.
    await createTestWorkoutSession(null, {
      athleteId: a.id,
      startedAt: new Date(next.getTime() - 60001),
      completedAt: new Date(next.getTime() - 1),
    });
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      workoutsCompleted: 2,
      workingSets: 3,
      loadVolumeKg: 250,
      unclassifiedWorkingSets: 1,
      attributes: { shortReps: 1, mediumReps: 0, longReps: 1, withoutReps: 1 },
    });
    expect(
      body.muscles.find(
        (m: { muscleGroup: string }) => m.muscleGroup === "CHEST",
      ),
    ).toMatchObject({ directWorkingSets: 1, directLoadVolumeKg: 100 });
    expect(
      body.muscles.find(
        (m: { muscleGroup: string }) => m.muscleGroup === "BACK",
      ),
    ).toMatchObject({ directWorkingSets: 1, directLoadVolumeKg: 150 });
    expect(
      body.muscles.find(
        (m: { muscleGroup: string }) => m.muscleGroup === "TRICEPS",
      ),
    ).toMatchObject({ directWorkingSets: 0, indirectWorkingSets: 1 });
    expect(body.days).toContainEqual({ date: endDate, workoutsCompleted: 1 });
  });
});
