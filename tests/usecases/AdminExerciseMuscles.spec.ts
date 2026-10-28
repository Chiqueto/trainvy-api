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

import { auth } from "../../src/lib/auth.js";
import { prisma } from "../../src/lib/db.js";
import { adminRoutes } from "../../src/routes/admin.js";
import { UpdateAdminExerciseMuscles } from "../../src/usecases/UpdateAdminExerciseMuscles.js";
import { GetExerciseCatalogVersion } from "../../src/usecases/GetExerciseCatalogVersion.js";
import { createTestUser, cleanupTestUsers } from "../helpers/test-db.js";

const app = Fastify();
const users: string[] = [],
  exercises: string[] = [];
beforeAll(async () => {
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.ready();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await app.close();
  await prisma.adminAuditLog.deleteMany({
    where: { adminUserId: { in: users } },
  });
  await prisma.exercise.deleteMany({ where: { id: { in: exercises } } });
  await cleanupTestUsers(users);
});
async function fixture() {
  const admin = await createTestUser();
  users.push(admin.id);
  await prisma.user.update({
    where: { id: admin.id },
    data: { systemRole: "ADMIN" },
  });
  const e = await prisma.exercise.create({
    data: {
      name: `Teste revisão ${crypto.randomUUID()}`,
      updatedAt: new Date("2026-01-01"),
      muscles: { create: { muscleGroup: "CHEST", role: "PRIMARY" } },
    },
  });
  exercises.push(e.id);
  vi.spyOn(auth.api, "getSession").mockResolvedValue({ user: admin } as Awaited<
    ReturnType<typeof auth.api.getSession>
  >);
  return {
    admin,
    e,
    body: {
      expectedUpdatedAt: e.updatedAt.toISOString(),
      primaryMuscleGroups: ["HIP_FLEXORS" as const],
      secondaryMuscleGroups: ["CORE" as const],
    },
  };
}
describe("Administrative muscle corrections", () => {
  it("atomically corrects roles, audits before/after and invalidates the catalog version", async () => {
    const { admin, e, body } = await fixture();
    const version = await new GetExerciseCatalogVersion().execute({
      userId: admin.id,
    });
    const res = await app.inject({
      method: "PUT",
      url: `/admin/exercises/${e.id}/muscles`,
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().muscles).toEqual([
      { muscleGroup: "HIP_FLEXORS", role: "PRIMARY" },
      { muscleGroup: "CORE", role: "SECONDARY" },
    ]);
    expect(
      (await prisma.exercise.findUniqueOrThrow({ where: { id: e.id } })).name,
    ).toBe(e.name);
    const audit = await prisma.adminAuditLog.findFirstOrThrow({
      where: { entityId: e.id },
    });
    expect(audit).toMatchObject({
      adminUserId: admin.id,
      action: "EXERCISE_MUSCLES_UPDATED",
      entityType: "EXERCISE",
      before: { muscles: [{ muscleGroup: "CHEST", role: "PRIMARY" }] },
      after: { muscles: res.json().muscles },
    });
    expect(
      (await new GetExerciseCatalogVersion().execute({ userId: admin.id }))
        .version,
    ).not.toBe(version.version);
    const repeat = await app.inject({
      method: "PUT",
      url: `/admin/exercises/${e.id}/muscles`,
      payload: { ...body, expectedUpdatedAt: res.json().updatedAt },
    });
    expect(repeat.statusCode).toBe(200);
    expect(
      await prisma.adminAuditLog.count({ where: { entityId: e.id } }),
    ).toBe(1);
  });
  it("rejects stale snapshots and preserves the current muscles", async () => {
    const { admin, e, body } = await fixture();
    await new UpdateAdminExerciseMuscles().execute(admin.id, e.id, body);
    const res = await app.inject({
      method: "PUT",
      url: `/admin/exercises/${e.id}/muscles`,
      payload: { ...body, primaryMuscleGroups: ["BACK"] },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("EXERCISE_CHANGED");
    expect(
      await prisma.exerciseMuscle.count({
        where: { exerciseId: e.id, muscleGroup: "HIP_FLEXORS" },
      }),
    ).toBe(1);
  });
  it("rejects empty primaries, duplicates, overlaps and arbitrary fields", async () => {
    const { e, body } = await fixture();
    for (const invalid of [
      { ...body, primaryMuscleGroups: [] },
      { ...body, secondaryMuscleGroups: ["HIP_FLEXORS"] },
      { ...body, primaryMuscleGroups: ["CORE", "CORE"] },
      { ...body, ownerUserId: "intruder" },
    ]) {
      expect(
        (
          await app.inject({
            method: "PUT",
            url: `/admin/exercises/${e.id}/muscles`,
            payload: invalid,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      await prisma.adminAuditLog.count({ where: { entityId: e.id } }),
    ).toBe(0);
  });
  it("protects custom exercises even from the global admin editor", async () => {
    const { admin, e, body } = await fixture();
    await prisma.exercise.update({
      where: { id: e.id },
      data: { ownerUserId: admin.id },
    });
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/admin/exercises/${e.id}/muscles`,
          payload: body,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      await prisma.exerciseMuscle.count({
        where: { exerciseId: e.id, muscleGroup: "CHEST" },
      }),
    ).toBe(1);
  });
  it("checks persisted admin role inside the use case and rejects anonymous requests", async () => {
    const { admin, e, body } = await fixture();
    await prisma.user.update({
      where: { id: admin.id },
      data: { systemRole: "USER" },
    });
    await expect(
      new UpdateAdminExerciseMuscles().execute(admin.id, e.id, body),
    ).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/admin/exercises/${e.id}/muscles`,
          payload: body,
        })
      ).statusCode,
    ).toBe(403);
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/admin/exercises/${e.id}/muscles`,
          payload: body,
        })
      ).statusCode,
    ).toBe(401);
  });
});
