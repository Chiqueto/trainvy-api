import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { auth } from "../../src/lib/auth.js";
import { exerciseRoutes } from "../../src/routes/exercise.js";
import { prisma } from "../../src/lib/db.js";
import { ExerciseDemonstrationSchema } from "../../src/schemas/exercise-demonstration.js";
import { CreateExercise } from "../../src/usecases/CreateExercise.js";
import { UpdateCustomExercise } from "../../src/usecases/ManageCustomExercise.js";
import { GetExerciseMedia } from "../../src/usecases/GetExerciseMedia.js";
import { SaveExerciseDemonstration } from "../../src/usecases/SaveExerciseDemonstration.js";
import { GetCommercialContext } from "../../src/usecases/GetCommercialContext.js";
import { GetExerciseCatalogVersion } from "../../src/usecases/GetExerciseCatalogVersion.js";
import { ListExercises } from "../../src/usecases/ListExercises.js";
import { createTestUser, cleanupTestUsers } from "../helpers/test-db.js";

describe("Private exercise demonstrations", () => {
  const users: string[] = [];
  let coach: string,
    otherCoach: string,
    athlete: string,
    outsider: string,
    globalId: string;
  const media = new GetExerciseMedia();
  const save = new SaveExerciseDemonstration();
  const demonstration = {
    youtubeUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
    animationKey: "squat" as const,
  };

  beforeAll(async () => {
    for (let i = 0; i < 4; i++) users.push((await createTestUser()).id);
    [coach, otherCoach, athlete, outsider] = users;
    await prisma.user.updateMany({
      where: { id: { in: [coach, otherCoach] } },
      data: { accountType: "COACH" },
    });
    await prisma.coachAthlete.create({
      data: { coachId: coach, athleteId: athlete, status: "ACTIVE" },
    });
    globalId = (
      await prisma.exercise.create({
        data: { name: `Shared ${crypto.randomUUID()}` },
      })
    ).id;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    if (globalId) await prisma.exercise.deleteMany({ where: { id: globalId } });
    await cleanupTestUsers(users);
  });

  it("validates and normalizes YouTube formats and rejects hostile URLs and unknown animations", () => {
    for (const url of [
      "https://youtu.be/M7lc1UVf-VE?t=10",
      "https://www.youtube.com/shorts/M7lc1UVf-VE",
      "https://m.youtube.com/watch?v=M7lc1UVf-VE",
    ]) {
      expect(
        ExerciseDemonstrationSchema.parse({ ...demonstration, youtubeUrl: url })
          .youtubeUrl,
      ).toBe(demonstration.youtubeUrl);
    }
    for (const youtubeUrl of [
      "javascript:alert(1)",
      "https://youtube.com.evil.test/watch?v=M7lc1UVf-VE",
      "https://youtube.com@evil.test/watch?v=M7lc1UVf-VE",
      "https://www.youtube.com/playlist?list=test",
      "http://youtu.be/M7lc1UVf-VE",
      "https://youtu.be/short",
    ]) {
      expect(
        ExerciseDemonstrationSchema.safeParse({ ...demonstration, youtubeUrl })
          .success,
      ).toBe(false);
    }
    expect(
      ExerciseDemonstrationSchema.safeParse({
        youtubeUrl: null,
        animationKey: "invented",
      }).success,
    ).toBe(false);
  });

  it("atomically creates and edits custom media, visible only to owner and active students", async () => {
    const exercise = await new CreateExercise().execute({
      userId: coach,
      name: `Private ${crypto.randomUUID()}`,
      demonstration,
    });
    expect(
      (await media.execute({ userId: coach, exerciseId: exercise.id }))
        .demonstration,
    ).toEqual(demonstration);
    expect(
      (await media.execute({ userId: athlete, exerciseId: exercise.id }))
        .demonstration,
    ).toEqual(demonstration);
    for (const userId of [otherCoach, outsider]) {
      await expect(
        media.execute({ userId, exerciseId: exercise.id }),
      ).rejects.toMatchObject({ name: "NotFoundError" });
      await expect(
        save.execute({ userId, exerciseId: exercise.id, demonstration }),
      ).rejects.toMatchObject({ name: "NotFoundError" });
    }
    await new UpdateCustomExercise().execute({
      userId: coach,
      exerciseId: exercise.id,
      demonstration: { youtubeUrl: null, animationKey: "deadlift" },
    });
    expect(
      (await media.execute({ userId: athlete, exerciseId: exercise.id }))
        .demonstration?.animationKey,
    ).toBe("deadlift");
    expect(
      (
        await new ListExercises().execute({ userId: coach, onlyCustom: true })
      ).find((e) => e.id === exercise.id)?.demonstration?.animationKey,
    ).toBe("deadlift");
    const unchanged = await new UpdateCustomExercise().execute({
      userId: coach,
      exerciseId: exercise.id,
      name: "Nome atualizado",
    });
    expect(unchanged.demonstration?.animationKey).toBe("deadlift");
    expect(unchanged.hasMedia).toBe(true);
    await prisma.coachAthlete.updateMany({
      where: { coachId: coach, athleteId: athlete },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await expect(
      media.execute({ userId: athlete, exerciseId: exercise.id }),
    ).rejects.toMatchObject({ name: "NotFoundError" });
    await prisma.coachAthlete.updateMany({
      where: { coachId: coach, athleteId: athlete },
      data: { status: "ACTIVE", revokedAt: null },
    });
    const removed = await new UpdateCustomExercise().execute({
      userId: coach,
      exerciseId: exercise.id,
      demonstration: { youtubeUrl: null, animationKey: null },
    });
    expect(removed.demonstration).toBeNull();
    expect(removed.hasMedia).toBe(false);
  });

  it("isolates overrides by coach without changing global catalog, and revocation restores global media", async () => {
    const original = await new GetCommercialContext().execute({
      userId: coach,
    });
    // Only commercial eligibility is stubbed; all ownership, links, persistence and resolution use the isolated database.
    vi.spyOn(GetCommercialContext.prototype, "execute").mockResolvedValue({
      ...original,
      accountType: "COACH",
      accountSetupCompletedAt: new Date().toISOString(),
      professionalVerification: {
        status: "VERIFIED",
        crefVerificationStatus: "DECLARED_ACTIVE",
        validUntil: null,
      },
      entitlements: [{ key: "MANAGE_ATHLETES", limitValue: 5 }],
    });
    const before = await prisma.exercise.findUniqueOrThrow({
      where: { id: globalId },
    });
    const version = await new GetExerciseCatalogVersion().execute({
      userId: coach,
    });
    await save.execute({ userId: coach, exerciseId: globalId, demonstration });
    await save.execute({
      userId: otherCoach,
      exerciseId: globalId,
      demonstration: { youtubeUrl: null, animationKey: "deadlift" },
    });
    expect(
      (await media.execute({ userId: athlete, exerciseId: globalId }))
        .demonstration,
    ).toEqual(demonstration);
    expect(
      (await media.execute({ userId: otherCoach, exerciseId: globalId }))
        .demonstration?.animationKey,
    ).toBe("deadlift");
    expect(
      (await media.execute({ userId: outsider, exerciseId: globalId }))
        .demonstration,
    ).toBeNull();
    expect(
      await prisma.exercise.findUnique({ where: { id: globalId } }),
    ).toEqual(before);
    expect(
      (await new GetExerciseCatalogVersion().execute({ userId: coach }))
        .version,
    ).not.toBe(version.version);
    await prisma.coachAthlete.updateMany({
      where: { coachId: coach, athleteId: athlete },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    expect(
      (await media.execute({ userId: athlete, exerciseId: globalId }))
        .demonstration,
    ).toBeNull();
    await save.execute({
      userId: coach,
      exerciseId: globalId,
      demonstration: { youtubeUrl: null, animationKey: null },
    });
    expect(
      await prisma.exerciseDemonstration.count({
        where: { ownerUserId: coach, exerciseId: globalId },
      }),
    ).toBe(0);
  });

  it("requires professional coach eligibility to customize a global exercise", async () => {
    await expect(
      save.execute({ userId: outsider, exerciseId: globalId, demonstration }),
    ).rejects.toMatchObject({ code: "ONLY_COACHES_ALLOWED" });
    await expect(
      save.execute({ userId: coach, exerciseId: globalId, demonstration }),
    ).rejects.toMatchObject({ code: "ACCOUNT_SETUP_REQUIRED" });
  });

  it("keeps same-named private and global exercises available in their own library tabs", async () => {
    const global = await prisma.exercise.findUniqueOrThrow({
      where: { id: globalId },
    });
    const custom = await new CreateExercise().execute({
      userId: coach,
      name: global.name,
    });
    const globals = await new ListExercises().execute({
      userId: coach,
      onlyGlobal: true,
    });
    const customs = await new ListExercises().execute({
      userId: coach,
      onlyCustom: true,
    });
    expect(globals.some((exercise) => exercise.id === globalId)).toBe(true);
    expect(globals.every((exercise) => exercise.ownerUserId === null)).toBe(
      true,
    );
    expect(customs.some((exercise) => exercise.id === custom.id)).toBe(true);
  });

  it("enforces authentication and URL validation over HTTP and serializes canonical media without caching", async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(exerciseRoutes, { prefix: "/exercises" });
    const exercise = await new CreateExercise().execute({
      userId: coach,
      name: `HTTP ${crypto.randomUUID()}`,
    });
    const session = vi.spyOn(auth.api, "getSession");
    try {
      session.mockResolvedValueOnce(null);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: `/exercises/${exercise.id}/demonstration`,
            payload: demonstration,
          })
        ).statusCode,
      ).toBe(401);
      const now = new Date();
      session.mockResolvedValue({
        user: await prisma.user.findUniqueOrThrow({ where: { id: coach } }),
        session: {
          id: "demonstration-test-session",
          userId: coach,
          token: "fictitious-test-token",
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + 60000),
          ipAddress: null,
          userAgent: null,
        },
      });
      const bad = await app.inject({
        method: "PUT",
        url: `/exercises/${exercise.id}/demonstration`,
        payload: { ...demonstration, youtubeUrl: "https://evil.test/video" },
      });
      expect(bad.statusCode).toBe(400);
      expect(
        await prisma.exerciseDemonstration.count({
          where: { exerciseId: exercise.id },
        }),
      ).toBe(0);
      const saved = await app.inject({
        method: "PUT",
        url: `/exercises/${exercise.id}/demonstration`,
        payload: {
          ...demonstration,
          youtubeUrl: "https://youtu.be/M7lc1UVf-VE",
        },
      });
      expect(saved.statusCode, saved.body).toBe(200);
      expect(saved.json()).toEqual(demonstration);
      const loaded = await app.inject({
        method: "GET",
        url: `/exercises/${exercise.id}/media`,
      });
      expect(loaded.statusCode, loaded.body).toBe(200);
      expect(loaded.headers["cache-control"]).toBe("private, no-store");
      expect(loaded.json().demonstration).toEqual(demonstration);
    } finally {
      await app.close();
    }
  });
});
