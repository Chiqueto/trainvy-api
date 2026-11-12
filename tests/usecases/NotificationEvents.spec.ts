import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  user: { findUnique: vi.fn() },
  coachAthlete: { findFirst: vi.fn() },
  create: vi.fn(),
  deliver: vi.fn(),
  committed: false,
}));
vi.mock("../../src/lib/db.js", () => ({
  prisma: {
    $transaction: mock.transaction,
    user: mock.user,
    coachAthlete: mock.coachAthlete,
  },
}));
vi.mock("../../src/services/SendPushToUser.js", () => ({
  createUserNotification: mock.create,
  deliverUserNotification: mock.deliver,
}));
vi.mock("../../src/usecases/GetCommercialContext.js", () => ({
  GetCommercialContext: class {
    async execute() {
      return {};
    }
  },
}));
vi.mock("../../src/domain/coach-athlete.js", async (original) => ({
  ...(await original<typeof import("../../src/domain/coach-athlete.js")>()),
  assertAthleteCanAcceptInvitation: vi.fn(),
  assertCoachCanManageAthletes: vi.fn(),
  getCoachAthleteLimit: () => null,
}));
vi.mock("../../src/domain/coach-prescription.js", async (original) => ({
  ...(await original<
    typeof import("../../src/domain/coach-prescription.js")
  >()),
  assertCoachCanPrescribe: vi.fn(),
}));
import { AcceptCoachInvitation } from "../../src/usecases/AcceptCoachInvitation.js";
import { SendWorkoutPrescription } from "../../src/usecases/SendWorkoutPrescription.js";

beforeEach(() => {
  vi.resetAllMocks();
  mock.committed = false;
  mock.create.mockImplementation(async () => {
    expect(mock.committed).toBe(false);
    return { id: "notification" };
  });
  mock.deliver.mockImplementation(async () => {
    expect(mock.committed).toBe(true);
  });
});

describe("domain notification events", () => {
  it("persists coach linking in its transaction and delivers only after commit", async () => {
    const now = new Date();
    mock.user.findUnique.mockResolvedValue({
      id: "athlete",
      accountSetupCompletedAt: now,
    });
    mock.coachAthlete.findFirst.mockResolvedValue(null);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      coachInvitation: {
        findUnique: async () => ({
          id: "invite",
          status: "PENDING",
          expiresAt: new Date("2099-01-01"),
          coachId: "coach",
          coach: { id: "coach", name: "Treinador", image: null },
        }),
        updateMany: async () => ({ count: 1 }),
      },
      coachAthlete: {
        findFirst: async () => null,
        count: async () => 0,
        create: async () => ({
          id: "link",
          coachId: "coach",
          athleteId: "athlete",
          status: "ACTIVE",
          createdAt: now,
        }),
      },
    };
    mock.transaction.mockImplementation(async (callback) => {
      const result = await callback(tx);
      mock.committed = true;
      return result;
    });
    const result = await new AcceptCoachInvitation().execute({
      athleteId: "athlete",
      token: "fake-token",
    });
    expect(tx.$queryRaw).toHaveBeenCalledWith(expect.any(Array), "coach");
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mock.create.mock.invocationCallOrder[0],
    );
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "athlete",
        type: "COACH_LINKED",
        url: "/profile",
      }),
      tx,
    );
    expect(mock.deliver).toHaveBeenCalledWith({ id: "notification" });
    expect(result).not.toHaveProperty("notification");
    expect(result.success).toBe(true);
  });

  it("notifies the athlete after sending an approved prescription", async () => {
    const now = new Date();
    const prescription = {
      id: "prescription",
      coachId: "coach",
      athleteId: "athlete",
      status: "DRAFT",
      version: 1,
      name: "Treino A",
      payload: { workoutDays: [{ isRest: false, exercises: [{}] }] },
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      $queryRaw: vi.fn(),
      workoutPrescription: {
        findUnique: async () => prescription,
        update: async () => ({ ...prescription, status: "SENT", sentAt: now }),
      },
      coachAthlete: { findFirst: async () => ({ id: "link" }) },
      professionalRegistration: {
        findUniqueOrThrow: async () => ({
          fullName: "Treinador",
          cref: "000000-G",
          region: "SP",
        }),
      },
    };
    mock.transaction.mockImplementation(async (callback) => {
      const result = await callback(tx);
      mock.committed = true;
      return result;
    });
    const result = await new SendWorkoutPrescription().execute({
      coachId: "coach",
      prescriptionId: "prescription",
      expectedVersion: 1,
      approval: true,
    });
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "athlete",
        type: "WORKOUT_ASSIGNED",
        url: "/planning",
        data: { prescriptionId: "prescription" },
      }),
      tx,
    );
    expect(mock.deliver).toHaveBeenCalledWith({ id: "notification" });
    expect(result).not.toHaveProperty("notification");
  });

  it("never sends push when the transaction fails", async () => {
    mock.transaction.mockRejectedValue(new Error("rollback"));
    await expect(
      new SendWorkoutPrescription().execute({
        coachId: "coach",
        prescriptionId: "prescription",
        expectedVersion: 1,
        approval: true,
      }),
    ).rejects.toThrow("rollback");
    expect(mock.deliver).not.toHaveBeenCalled();
  });
});
