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
import { CoachAthleteError } from "../../src/domain/coach-athlete.js";
import { auth } from "../../src/lib/auth.js";
import { prisma } from "../../src/lib/db.js";
import { meRoutes } from "../../src/routes/me.js";
import { sportsProfileRoutes } from "../../src/routes/sports-profile.js";
import { WorkoutPlanRoutes } from "../../src/routes/workout-plan.js";
import { workoutSessionRoutes } from "../../src/routes/workout-session.js";
import { assertHealthWriteAccess } from "../../src/usecases/LegalCompliance.js";
import { acceptTestHealthConsent } from "../helpers/legal-consent.js";
import {
  cleanupTestUsers,
  createTestUser,
  createTestWorkoutDay,
  createTestWorkoutPlan,
} from "../helpers/test-db.js";

const app = Fastify();
const users: string[] = [];
beforeAll(async () => {
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook("preHandler", async (request, reply) => {
    const session = await auth.api.getSession({ headers: new Headers() });
    if (!session) return;
    try {
      await assertHealthWriteAccess(
        session.user.id,
        request.method,
        request.url,
      );
    } catch (error) {
      if (error instanceof CoachAthleteError)
        return reply
          .code(error.status)
          .send({ error: error.message, code: error.code });
      throw error;
    }
  });
  await app.register(sportsProfileRoutes);
  await app.register(WorkoutPlanRoutes, { prefix: "/workout-plans" });
  await app.register(workoutSessionRoutes);
  await app.register(meRoutes, { prefix: "/me" });
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

async function account(withConsent = true) {
  const user = await createTestUser();
  users.push(user.id);
  if (withConsent) await acceptTestHealthConsent(user.id);
  vi.spyOn(auth.api, "getSession").mockResolvedValue({
    user,
    session: { id: "test" },
  } as Awaited<ReturnType<typeof auth.api.getSession>>);
  return user;
}

describe("Idade como dado de perfil, sem bloqueio de maioridade", () => {
  it("permite iniciar treino mesmo sem nascimento registrado", async () => {
    const user = await account();
    const plan = await createTestWorkoutPlan(user.id);
    const day = await createTestWorkoutDay(plan.id);
    const url = `/workout-plans/${plan.id}/days/${day.id}/sessions`;
    const started = await app.inject({ method: "POST", url });
    expect(started.statusCode).toBe(201);
    expect(
      await prisma.workoutSession.count({ where: { athleteId: user.id } }),
    ).toBe(1);
  });

  it("preserva nascimento e idade calculada de aluno menor de 18 e permite treino avulso", async () => {
    const user = await account();
    const today = new Date();
    const birthDate = `${today.getUTCFullYear() - 15}-01-01`;
    const response = await app.inject({
      method: "PATCH",
      url: "/me/sports-profile",
      payload: { birthDate },
    });
    expect(response.statusCode).toBe(200);
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(stored.birthDate?.toISOString().slice(0, 10)).toBe(birthDate);
    expect(stored.age).toBe(ageFromBirthDate(birthDate));
    expect(
      (await app.inject({ method: "POST", url: "/workout-sessions/free" }))
        .statusCode,
    ).toBe(201);
  });

  it("mantém exigência dos aceites legais na atualização de nascimento", async () => {
    await account(false);
    const response = await app.inject({
      method: "PATCH",
      url: "/me/sports-profile",
      payload: { birthDate: "1990-01-01" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("LEGAL_ACCEPTANCE_REQUIRED");
  });

  it("aceita idade legada e nascimento de menor no cadastro, sem perder o histórico de idade", async () => {
    const user = await account();
    const metrics = { weightInGrams: 60000, heightInCentimeters: 170 };
    const legacy = await app.inject({
      method: "PUT",
      url: "/me",
      payload: { ...metrics, age: 15 },
    });
    expect(legacy.statusCode).toBe(200);
    expect(legacy.json()).toMatchObject({ age: 15, birthDate: null });
    const birthDate = `${new Date().getUTCFullYear() - 16}-01-01`;
    const updated = await app.inject({
      method: "PUT",
      url: "/me",
      payload: { ...metrics, birthDate },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      age: ageFromBirthDate(birthDate),
      birthDate,
    });
    const history = await prisma.userMetricLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((log) => log.age)).toEqual([
      15,
      ageFromBirthDate(birthDate),
    ]);
  });
});
