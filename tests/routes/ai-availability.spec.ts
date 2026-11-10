import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { prisma } from "../../src/lib/db.js";
import {
  AiAvailability,
  assertAiEnabledForUser,
  readAiAvailability,
} from "../../src/usecases/AiAvailability.js";
import { CheckAndConsumeAiQuota } from "../../src/usecases/CheckAndConsumeAiQuota.js";
import { CreateSignupIntent } from "../../src/usecases/CreateSignupIntent.js";
import { ListPublicPlans } from "../../src/usecases/ListPublicPlans.js";
import { aiAvailabilityRoutes } from "../../src/routes/ai-availability.js";
import { cleanupTestUsers, createTestUser } from "../helpers/test-db.js";

const session = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("../../src/lib/auth.js", () => ({
  auth: {
    api: {
      getSession: async () =>
        session.id ? { user: { id: session.id } } : null,
    },
  },
}));

describe("persistent AI availability by account audience", () => {
  const app = Fastify();
  let before: Awaited<ReturnType<typeof prisma.aiAvailability.findUnique>>;
  let coach: string;
  let athlete: string;
  let admin: string;
  let planId: string;
  beforeAll(async () => {
    before = await prisma.aiAvailability.findUnique({
      where: { id: "global" },
    });
    coach = (await createTestUser()).id;
    athlete = (await createTestUser()).id;
    admin = (await createTestUser()).id;
    await prisma.user.update({
      where: { id: coach },
      data: { accountType: "COACH" },
    });
    await prisma.user.update({
      where: { id: admin },
      data: { systemRole: "ADMIN" },
    });
    planId = (
      await prisma.plan.create({
        data: {
          code: `AI_FLAG_${crypto.randomUUID()}`,
          name: "AI flag fixture",
          audience: "COACH",
          monthlyPriceInCents: 1,
          isActive: true,
          isPublic: true,
          entitlements: { create: [{ entitlement: "AI_CHAT" }] },
        },
      })
    ).id;
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(aiAvailabilityRoutes);
  });
  beforeEach(async () => {
    session.id = null;
    await prisma.aiAvailability.upsert({
      where: { id: "global" },
      create: { id: "global" },
      update: {
        professionalAiEnabled: false,
        athleteAiEnabled: false,
        revision: 0,
      },
    });
  });
  afterAll(async () => {
    await app.close();
    await prisma.adminAuditLog.deleteMany({ where: { adminUserId: admin } });
    await cleanupTestUsers([coach, athlete, admin]);
    await prisma.plan.deleteMany({ where: { id: planId } });
    if (before)
      await prisma.aiAvailability.upsert({
        where: { id: "global" },
        create: before,
        update: before,
      });
    else await prisma.aiAvailability.deleteMany({ where: { id: "global" } });
  });
  it("database defaults and a missing global row both disable both audiences", async () => {
    const row = await prisma.aiAvailability.create({
      data: { id: crypto.randomUUID() },
    });
    expect(row).toMatchObject({
      professionalAiEnabled: false,
      athleteAiEnabled: false,
    });
    await prisma.aiAvailability.delete({ where: { id: row.id } });
    await prisma.aiAvailability.delete({ where: { id: "global" } });
    expect(await readAiAvailability()).toMatchObject({
      professionalAiEnabled: false,
      athleteAiEnabled: false,
    });
    await expect(assertAiEnabledForUser(coach)).rejects.toMatchObject({
      code: "AI_DISABLED",
    });
  });
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    "independently gates professionals=%s, athletes=%s",
    async (professionalAiEnabled, athleteAiEnabled) => {
      await prisma.aiAvailability.update({
        where: { id: "global" },
        data: { professionalAiEnabled, athleteAiEnabled },
      });
      for (const [id, enabled] of [
        [coach, professionalAiEnabled],
        [athlete, athleteAiEnabled],
      ] as const) {
        if (enabled)
          await expect(assertAiEnabledForUser(id)).resolves.toBeUndefined();
        else
          await expect(assertAiEnabledForUser(id)).rejects.toMatchObject({
            code: "AI_DISABLED",
            statusCode: 503,
          });
      }
    },
  );
  it("fails closed when policy lookup fails and for a missing actor", async () => {
    const spy = vi
      .spyOn(prisma.aiAvailability, "findUnique")
      .mockRejectedValueOnce(new Error("unavailable"));
    await expect(assertAiEnabledForUser(coach)).rejects.toMatchObject({
      code: "AI_DISABLED",
    });
    spy.mockRestore();
    await expect(assertAiEnabledForUser()).rejects.toMatchObject({
      code: "AI_DISABLED",
    });
  });
  it("does not consume a quota reservation while disabled", async () => {
    await expect(
      new CheckAndConsumeAiQuota().execute({
        userId: coach,
        config: { dailyUserLimit: 5 },
      }),
    ).rejects.toMatchObject({ code: "AI_DISABLED" });
    expect(await prisma.aiRequestLog.count({ where: { userId: coach } })).toBe(
      0,
    );
    expect(await prisma.aiUsageDaily.count({ where: { userId: coach } })).toBe(
      0,
    );
  });
  it("publishes only flags, without admin metadata or caching", async () => {
    const result = await app.inject({ url: "/features/ai" });
    expect(result.json()).toEqual({
      professionalAiEnabled: false,
      athleteAiEnabled: false,
    });
    expect(result.headers["cache-control"]).toBe("no-store");
  });
  it("requires a session and a persisted admin role", async () => {
    expect(
      (await app.inject({ url: "/admin/ai-availability" })).statusCode,
    ).toBe(401);
    session.id = coach;
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/admin/ai-availability",
          payload: {
            professionalAiEnabled: true,
            athleteAiEnabled: true,
            revision: 0,
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(await readAiAvailability()).toMatchObject({
      professionalAiEnabled: false,
      athleteAiEnabled: false,
    });
  });
  it("persists both independent flags and an audit event", async () => {
    session.id = admin;
    const result = await app.inject({
      method: "PATCH",
      url: "/admin/ai-availability",
      payload: {
        professionalAiEnabled: true,
        athleteAiEnabled: false,
        revision: 0,
      },
    });
    expect(result.statusCode).toBe(200);
    expect(await new AiAvailability().get(admin)).toMatchObject({
      professionalAiEnabled: true,
      athleteAiEnabled: false,
      revision: 1,
    });
    const audit = await prisma.adminAuditLog.findFirst({
      where: { adminUserId: admin, action: "AI_AVAILABILITY_UPDATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.after).toMatchObject({
      professionalAiEnabled: true,
      athleteAiEnabled: false,
    });
  });
  it("rejects concurrent updates with the same revision", async () => {
    const service = new AiAvailability();
    const results = await Promise.allSettled([
      service.update(admin, {
        professionalAiEnabled: true,
        athleteAiEnabled: false,
        revision: 0,
      }),
      service.update(admin, {
        professionalAiEnabled: false,
        athleteAiEnabled: true,
        revision: 0,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({ reason: { code: "CONCURRENCY_CONFLICT" } });
  });
  it("hides AI professional offers and rejects direct signup while disabled", async () => {
    const code = (
      await prisma.plan.findUniqueOrThrow({ where: { id: planId } })
    ).code;
    expect(
      (await new ListPublicPlans().execute({ audience: "COACH" })).some(
        (plan) => plan.code === code,
      ),
    ).toBe(false);
    await expect(
      new CreateSignupIntent().execute({
        accountType: "COACH",
        planCode: code,
      }),
    ).rejects.toMatchObject({ code: "AI_DISABLED" });
    await prisma.aiAvailability.update({
      where: { id: "global" },
      data: { professionalAiEnabled: true },
    });
    expect(
      (await new ListPublicPlans().execute({ audience: "COACH" })).some(
        (plan) => plan.code === code,
      ),
    ).toBe(true);
  });
});
