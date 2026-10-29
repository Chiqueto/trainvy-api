import { SendWorkoutPrescription } from "../../src/usecases/SendWorkoutPrescription.js";
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

import { ageFromBirthDate } from "../../src/domain/birth-date.js";
import { auth } from "../../src/lib/auth.js";
import { prisma } from "../../src/lib/db.js";
import { adminRoutes } from "../../src/routes/admin.js";
import { meRoutes } from "../../src/routes/me.js";
import { sportsProfileRoutes } from "../../src/routes/sports-profile.js";
import { WorkoutPlanRoutes } from "../../src/routes/workout-plan.js";
import { AcceptWorkoutPrescription } from "../../src/usecases/AcceptWorkoutPrescription.js";
import { AllocateWorkoutPlanTemplate } from "../../src/usecases/AllocateWorkoutPlanTemplate.js";
import { CreateWorkoutPlan } from "../../src/usecases/CreateWorkoutPlan.js";
import { CreateWorkoutPlanInPeriodization } from "../../src/usecases/CreateWorkoutPlanInPeriodization.js";
import { CreateWorkoutPlanTemplate } from "../../src/usecases/CreateWorkoutPlanTemplate.js";
import { DuplicateWorkoutPlan } from "../../src/usecases/DuplicateWorkoutPlan.js";
import { EditWorkoutPlan } from "../../src/usecases/EditWorkoutPlan.js";
import { GetCommercialContext } from "../../src/usecases/GetCommercialContext.js";
import { GetUserTrainData } from "../../src/usecases/GetUserTrainData.js";
import { GetWorkoutDay } from "../../src/usecases/GetWorkoutDay.js";
import { GetWorkoutHistorySession } from "../../src/usecases/GetWorkoutHistorySession.js";
import { GetWorkoutSession } from "../../src/usecases/GetWorkoutSession.js";
import { GetSportsProfile } from "../../src/usecases/SportsProfile.js";
import { StartWorkoutSession } from "../../src/usecases/StartWorkoutSession.js";
import { UpsertUserTrainData } from "../../src/usecases/UpsertUserTrainData.js";
import {
  cleanupTestUsers,
  createTestPeriodization,
  createTestUser,
} from "../helpers/test-db.js";

const users: string[] = [],
  plans: string[] = [];
async function user(admin = false) {
  const u = await createTestUser();
  users.push(u.id);
  if (admin)
    await prisma.user.update({
      where: { id: u.id },
      data: { systemRole: "ADMIN" },
    });
  return u;
}
function login(u: Awaited<ReturnType<typeof createTestUser>>) {
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user: u,
    session: {
      id: "test",
      userId: u.id,
      expiresAt: new Date(Date.now() + 60000),
      token: "test",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as Awaited<ReturnType<typeof auth.api.getSession>>);
}
const targets = {
  repsMin: 8,
  repsMax: 12,
  targetRir: 0,
  targetLoadInGrams: 12500,
  tempo: "3-1-1-0",
};
const exercise = {
  name: "Exercício teste",
  order: 0,
  sets: 3,
  reps: 10,
  restTimeInSeconds: 90,
  ...targets,
};
const days = [
  {
    name: "Treino A",
    isRest: false,
    estimatedDurationInSeconds: 2700,
    exercises: [exercise],
  },
];
const app = Fastify();
beforeAll(async () => {
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(meRoutes, { prefix: "/me" });
  await app.register(sportsProfileRoutes);
  await app.register(WorkoutPlanRoutes, { prefix: "/workout-plans" });
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.ready();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await prisma.adminAuditLog.deleteMany({
    where: { adminUserId: { in: users } },
  });
  await cleanupTestUsers(users.splice(0));
  await prisma.plan.deleteMany({ where: { id: { in: plans.splice(0) } } });
});
afterAll(() => app.close());

describe("Optional sports profile and body fat", () => {
  it("saves birth date and goals atomically with the initial metrics, deriving age on the server", async () => {
    const owner = await user();
    login(owner);
    const response = await app.inject({
      method: "PUT",
      url: "/me",
      payload: {
        weightInGrams: 75500,
        heightInCentimeters: 175,
        birthDate: "1998-05-20",
        trainingGoals: "  Ganhar força  ",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      birthDate: "1998-05-20",
      age: ageFromBirthDate("1998-05-20"),
    });
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: owner.id },
    });
    expect(stored.birthDate?.toISOString()).toBe("1998-05-20T00:00:00.000Z");
    expect(stored.trainingGoals).toBe("Ganhar força");
    const logs = await prisma.userMetricLog.findMany({
      where: { userId: owner.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].age).toBe(ageFromBirthDate("1998-05-20"));
  });
  it("keeps legacy accounts accessible and completes missing profile fields without rewriting metric history", async () => {
    const owner = await user(),
      other = await user();
    login(owner);
    const metrics = { weightInGrams: 80000, heightInCentimeters: 180, age: 25 };
    await new UpsertUserTrainData().execute({ userId: owner.id, ...metrics });
    expect(
      await new GetUserTrainData().execute({ userId: owner.id }),
    ).toMatchObject({ age: 25, birthDate: null });
    expect(await new GetSportsProfile().execute(owner.id)).toMatchObject({
      birthDate: null,
      trainingGoals: null,
    });
    const response = await app.inject({
      method: "PATCH",
      url: "/me/sports-profile",
      payload: { birthDate: "1990-11-01", trainingGoals: "Condicionamento" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      birthDate: "1990-11-01",
      trainingGoals: "Condicionamento",
    });
    expect(
      await new GetUserTrainData().execute({ userId: owner.id }),
    ).toMatchObject({ age: ageFromBirthDate("1990-11-01") });
    expect(
      await prisma.userMetricLog.findMany({
        where: { userId: owner.id },
        select: { age: true },
      }),
    ).toEqual([{ age: 25 }]);
    expect(await new GetSportsProfile().execute(other.id)).toMatchObject({
      birthDate: null,
      trainingGoals: null,
    });
    // A legacy caller's age cannot replace age calculated from a known birth date.
    await new UpsertUserTrainData().execute({
      userId: owner.id,
      ...metrics,
      age: 99,
    });
    expect(
      await new GetUserTrainData().execute({ userId: owner.id }),
    ).toMatchObject({
      age: ageFromBirthDate("1990-11-01"),
      birthDate: "1990-11-01",
    });
  });
  it("rejects invalid birth dates and blank onboarding goals before any write", async () => {
    const owner = await user();
    login(owner);
    for (const payload of [
      { birthDate: "2000-02-30", trainingGoals: "Força" },
      { birthDate: "9999-01-01", trainingGoals: "Força" },
      { birthDate: "2025-01-01", trainingGoals: "Força" },
      { birthDate: "1998-05-20", trainingGoals: "   " },
    ]) {
      const response = await app.inject({
        method: "PUT",
        url: "/me",
        payload: { ...payload, weightInGrams: 70000, heightInCentimeters: 170 },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(
      await prisma.userMetricLog.count({ where: { userId: owner.id } }),
    ).toBe(0);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .birthDate,
    ).toBeNull();
  });
  it("persists optional sports data without generating biometric logs or changing another user", async () => {
    const owner = await user(),
      other = await user();
    login(owner);
    const payload = {
      trainingGoals: "Força e condicionamento",
      experienceLevel: "INTERMEDIATE",
      availableEquipment: ["Halteres", "Barra", "Halteres"],
      trainingRestrictions: "Restrição declarada pelo usuário",
    };
    const saved = await app.inject({
      method: "PATCH",
      url: "/me/sports-profile",
      payload,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().availableEquipment).toEqual(["Halteres", "Barra"]);
    expect(
      (await app.inject({ url: "/me/sports-profile" })).json(),
    ).toMatchObject({
      trainingGoals: payload.trainingGoals,
      experienceLevel: "INTERMEDIATE",
    });
    expect(
      await prisma.userMetricLog.count({ where: { userId: owner.id } }),
    ).toBe(0);
    expect(
      (await new GetSportsProfile().execute(other.id)).trainingGoals,
    ).toBeNull();
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/me/sports-profile",
          payload: { userId: other.id, trainingGoals: "Invasão" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/me/sports-profile",
          payload: { experienceLevel: "UNKNOWN" },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("allows body fat to be omitted or cleared, preserves an omitted existing value, and completes onboarding", async () => {
    const owner = await user();
    login(owner);
    const metrics = { weightInGrams: 70000, heightInCentimeters: 170, age: 30 };
    let saved = await app.inject({
      method: "PUT",
      url: "/me",
      payload: metrics,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().bodyFatPercentage).toBeNull();
    expect(
      await new GetUserTrainData().execute({ userId: owner.id }),
    ).toMatchObject({ weightInGrams: 70000, bodyFatPercentage: null });
    await app.inject({
      method: "PUT",
      url: "/me",
      payload: { ...metrics, bodyFatPercentage: 20 },
    });
    saved = await app.inject({ method: "PUT", url: "/me", payload: metrics });
    expect(saved.json().bodyFatPercentage).toBe(20);
    saved = await app.inject({
      method: "PUT",
      url: "/me",
      payload: { ...metrics, bodyFatPercentage: null },
    });
    expect(saved.json().bodyFatPercentage).toBeNull();
    const log = await prisma.userMetricLog.findFirstOrThrow({
      where: { userId: owner.id },
      orderBy: { loggedAt: "desc" },
    });
    expect(log.bodyFatPercentage).toBeNull();
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/me",
          payload: { ...metrics, bodyFatPercentage: -1 },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("requires authentication for sports profile reads and writes", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
    expect((await app.inject({ url: "/me/sports-profile" })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/me/sports-profile",
          payload: {},
        })
      ).statusCode,
    ).toBe(401);
  });
});

describe("Advanced prescriptions stay separate from performed sets", () => {
  it("preserves optional targets across creation, duplication, sessions, historical snapshots and legacy edits", async () => {
    const owner = await user();
    const plan = await new CreateWorkoutPlan().execute({
      userId: owner.id,
      name: "Plano",
      workoutDays: days,
    });
    const day = await prisma.workoutDay.findFirstOrThrow({
      where: { workoutPlanId: plan.id },
      include: { exercises: true },
    });
    expect(day.exercises[0]).toMatchObject(targets);
    const copy = await new DuplicateWorkoutPlan().execute({
      userId: owner.id,
      workoutPlanId: plan.id,
    });
    expect(copy.workoutDays[0].exercises[0]).toMatchObject(targets);
    const started = await new StartWorkoutSession().execute({
      userId: owner.id,
      workoutPlanId: plan.id,
      workoutDayId: day.id,
    });
    const session = await new GetWorkoutSession().execute({
      userId: owner.id,
      sessionId: started.userWorkoutSessionId,
    });
    expect(session.sessionExercises[0]).toMatchObject({
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      plannedTargetRir: 0,
      plannedTargetLoadInGrams: 12500,
      plannedTempo: "3-1-1-0",
    });
    expect(session.sessionExercises[0].sets[0]).toMatchObject({
      weightInGrams: null,
      rir: null,
      reps: 8,
      completedAt: null,
    });
    await prisma.workoutSession.update({
      where: { id: session.id },
      data: { completedAt: new Date() },
    });
    await new EditWorkoutPlan().execute(owner.id, plan.id, {
      name: "Edição legada",
      workoutDays: [
        {
          ...days[0],
          id: day.id,
          exercises: [
            {
              id: day.exercises[0].id,
              name: exercise.name,
              order: 0,
              sets: 5,
              reps: 10,
              restTimeInSeconds: 90,
            },
          ],
        },
      ],
    });
    expect(
      await prisma.workoutExercise.findUniqueOrThrow({
        where: { id: day.exercises[0].id },
      }),
    ).toMatchObject(targets);
    await new EditWorkoutPlan().execute(owner.id, plan.id, {
      name: "Sem metas",
      workoutDays: [
        {
          ...days[0],
          id: day.id,
          exercises: [
            {
              ...exercise,
              id: day.exercises[0].id,
              repsMin: null,
              repsMax: null,
              targetRir: null,
              targetLoadInGrams: null,
              tempo: null,
            },
          ],
        },
      ],
    });
    expect(
      (
        await new GetWorkoutDay().execute({
          userId: owner.id,
          workoutPlanId: plan.id,
          workoutDayId: day.id,
        })
      ).exercises[0].targetRir,
    ).toBeNull();
    const history = await new GetWorkoutHistorySession().execute({
      userId: owner.id,
      sessionId: session.id,
    });
    expect(history.exercises[0].planned).toMatchObject(targets);
  });
  it("stores targets in periodization plans and rejects inverted or partial ranges by HTTP", async () => {
    const owner = await user();
    login(owner);
    const periodization = await createTestPeriodization(owner.id);
    const block = await new CreateWorkoutPlanInPeriodization().execute({
      userId: owner.id,
      periodizationId: periodization.id,
      name: "Bloco",
      workoutDays: days,
    });
    expect(block.workoutPlan.workoutDays[0].exercises[0]).toMatchObject(
      targets,
    );
    for (const invalid of [
      { repsMin: 12, repsMax: 8 },
      { repsMin: 8, repsMax: null },
      { targetRir: 11 },
      { targetLoadInGrams: -1 },
    ]) {
      const result = await app.inject({
        method: "POST",
        url: "/workout-plans",
        payload: {
          name: "Inválido",
          activate: false,
          workoutDays: [
            { ...days[0], exercises: [{ ...exercise, ...invalid }] },
          ],
        },
      });
      expect(result.statusCode).toBe(400);
    }
    const legacy = await new CreateWorkoutPlan().execute({
      userId: owner.id,
      name: "Legado",
      activate: false,
      workoutDays: [
        {
          ...days[0],
          exercises: [
            {
              name: "Simples",
              order: 0,
              sets: 3,
              reps: 10,
              restTimeInSeconds: 60,
            },
          ],
        },
      ],
    });
    expect(legacy.workoutDays[0].exercises[0]).toMatchObject({
      reps: 10,
      repsMin: null,
      targetRir: null,
      tempo: null,
    });
  });
  it("retains advanced data from a coach template through allocation and athlete acceptance", async () => {
    const coach = await user(),
      athlete = await user();
    await prisma.user.update({
      where: { id: coach.id },
      data: {
        accountType: "COACH",
        professionalRegistration: {
          create: {
            fullName: "Verified Fixture",
            cref: "123456-G",
            region: "SP",
            category: "Bacharel",
            status: "VERIFIED",
            verifiedAt: new Date(),
            validUntil: new Date("2099-01-01"),
          },
        },
        accountSetupCompletedAt: new Date(),
      },
    });
    const plan = await prisma.plan.create({
      data: {
        code: `TEST_${crypto.randomUUID()}`,
        name: "Coach",
        audience: "COACH",
        monthlyPriceInCents: 1000,
        entitlements: {
          create: [
            { entitlement: "MANAGE_ATHLETES", limitValue: 5 },
            { entitlement: "ASSIGN_WORKOUTS", limitValue: null },
          ],
        },
      },
    });
    plans.push(plan.id);
    await prisma.subscription.create({
      data: {
        userId: coach.id,
        planId: plan.id,
        status: "ACTIVE",
        billingProvider: "MANUAL",
        priceInCentsSnapshot: 1000,
        currencySnapshot: "BRL",
      },
    });
    await prisma.coachAthlete.create({
      data: { coachId: coach.id, athleteId: athlete.id, status: "ACTIVE" },
    });
    const template = await new CreateWorkoutPlanTemplate().execute({
      coachId: coach.id,
      name: "Modelo",
      workoutDays: days,
    });
    const sent = await new AllocateWorkoutPlanTemplate().execute({
      coachId: coach.id,
      templateId: template.id,
      athleteId: athlete.id,
    });
    await new SendWorkoutPrescription().execute({
      coachId: coach.id,
      prescriptionId: sent.prescription.id,
      expectedVersion: sent.prescription.version,
      approval: true,
    });
    const accepted = await new AcceptWorkoutPrescription().execute({
      athleteId: athlete.id,
      prescriptionId: sent.prescription.id,
    });
    const saved = await prisma.workoutExercise.findFirstOrThrow({
      where: { workoutDay: { workoutPlanId: accepted.workoutPlanId } },
    });
    expect(saved).toMatchObject(targets);
  });
});

describe("Administrative plan creation and dynamic permissions", () => {
  const payload = () => ({
    code: `CUSTOM_${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`,
    name: "Novo plano",
    audience: "COACH",
    monthlyPriceInCents: 3990,
    isPublic: true,
    entitlements: [
      { entitlement: "MANAGE_ATHLETES", limitValue: 5 },
      { entitlement: "ASSIGN_WORKOUTS", limitValue: null },
    ],
  });
  it("creates and audits a plan, updates live permissions, and preserves subscription price snapshots", async () => {
    const admin = await user(true),
      coach = await user();
    login(admin);
    await prisma.user.update({
      where: { id: coach.id },
      data: {
        accountType: "COACH",
        professionalRegistration: {
          create: {
            fullName: "Verified Fixture",
            cref: "123456-G",
            region: "SP",
            category: "Bacharel",
            status: "VERIFIED",
            verifiedAt: new Date(),
            validUntil: new Date("2099-01-01"),
          },
        },
        accountSetupCompletedAt: new Date(),
      },
    });
    const input = payload();
    const result = await app.inject({
      method: "POST",
      url: "/admin/plans",
      payload: input,
    });
    expect(result.statusCode).toBe(201);
    const created = result.json();
    plans.push(created.id);
    expect(created).toMatchObject({
      code: input.code,
      currency: "BRL",
      monthlyPriceInCents: 3990,
    });
    expect(
      await prisma.subscription.count({ where: { planId: created.id } }),
    ).toBe(0);
    await prisma.subscription.create({
      data: {
        userId: coach.id,
        planId: created.id,
        status: "ACTIVE",
        billingProvider: "MANUAL",
        priceInCentsSnapshot: 2500,
        currencySnapshot: "BRL",
      },
    });
    const changed = await app.inject({
      method: "PUT",
      url: `/admin/plans/${created.id}/entitlements`,
      payload: {
        entitlements: [{ entitlement: "MANAGE_ATHLETES", limitValue: 2 }],
      },
    });
    expect(changed.statusCode).toBe(200);
    const context = await new GetCommercialContext().execute({
      userId: coach.id,
    });
    expect(context.entitlements).toEqual([
      { key: "MANAGE_ATHLETES", limitValue: 2 },
    ]);
    expect(context.subscription?.priceInCentsSnapshot).toBe(2500);
    expect(
      (await prisma.plan.findUniqueOrThrow({ where: { id: created.id } }))
        .monthlyPriceInCents,
    ).toBe(3990);
    expect(
      await prisma.adminAuditLog.count({
        where: {
          adminUserId: admin.id,
          action: "PLAN_CREATED",
          entityId: created.id,
        },
      }),
    ).toBe(1);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/admin/plans",
          payload: input,
        })
      ).statusCode,
    ).toBe(409);
  });
  it("rejects non-admins, public internal plans and duplicate permissions", async () => {
    const normal = await user();
    login(normal);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/admin/plans",
          payload: payload(),
        })
      ).statusCode,
    ).toBe(403);
    const admin = await user(true);
    login(admin);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/admin/plans",
          payload: { ...payload(), audience: "INTERNAL" },
        })
      ).statusCode,
    ).toBe(400);
    const input = payload();
    input.entitlements.push(input.entitlements[0]);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/admin/plans",
          payload: input,
        })
      ).statusCode,
    ).toBe(400);
    await prisma.user.update({
      where: { id: admin.id },
      data: { systemRole: "USER" },
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/admin/plans",
          payload: payload(),
        })
      ).statusCode,
    ).toBe(403);
  });
});
