import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateObject } from "ai";
import { GenerateCoachPrescriptionDraftWithAi } from "../../src/usecases/GenerateCoachPrescriptionDraftWithAi.js";
import { assertHealthConsent } from "../../src/usecases/LegalCompliance.js";

const state = vi.hoisted(() => ({
  acceptances: [] as {
    userId: string;
    documentVersion: string;
    revokedAt: Date | null;
  }[],
  consentReads: [] as string[],
  linked: true,
  allowed: true,
  revokeBeforeProvider: false,
  transform: undefined as
    | undefined
    | ((input: { params: { prompt: [] } }) => Promise<unknown>),
  save: vi.fn(),
}));

vi.mock("../../src/lib/db.js", () => ({
  prisma: {
    coachAthlete: {
      findFirst: async () =>
        state.linked ? { athlete: { id: "athlete", name: "Aluno" } } : null,
    },
    legalDocument: {
      findUnique: async () => ({
        id: "health",
        isActive: true,
        version: "1.0.1",
      }),
    },
    userLegalAcceptance: {
      findFirst: async ({
        where,
      }: {
        where: { userId: string; documentVersion: string };
      }) => {
        state.consentReads.push(where.userId);
        return (
          state.acceptances.find(
            (a) =>
              a.userId === where.userId &&
              a.documentVersion === where.documentVersion &&
              !a.revokedAt,
          ) ?? null
        );
      },
    },
  },
}));
vi.mock("../../src/lib/admin-config.js", () => ({
  isConfiguredAdminEmail: () => false,
}));
vi.mock("../../src/usecases/GetCommercialContext.js", () => ({
  GetCommercialContext: class {
    async execute() {
      return {
        accountType: "COACH",
        accountSetupCompletedAt: "2026-11-06T00:00:00Z",
        professionalVerification: state.allowed
          ? {
              status: "PENDING_VERIFICATION",
              crefVerificationStatus: "DECLARED_ACTIVE",
              validUntil: null,
            }
          : null,
        entitlements: [{ key: "MANAGE_ATHLETES", limitValue: 10 }],
      };
    }
  },
}));
vi.mock("../../src/usecases/RecordAiUsage.js", () => ({
  trackAiGeneration: async (_: unknown, generate: () => Promise<unknown>) =>
    generate(),
}));
vi.mock("../../src/usecases/CreateWorkoutPrescriptionDraft.js", () => ({
  CreateWorkoutPrescriptionDraft: class {
    execute = state.save;
  },
}));
vi.mock("@ai-sdk/google", () => ({ google: () => ({}) }));
vi.mock("ai", () => ({
  wrapLanguageModel: ({
    middleware,
  }: {
    middleware: { transformParams: typeof state.transform };
  }) => {
    state.transform = middleware.transformParams;
    return {};
  },
  generateObject: vi.fn(async () => {
    if (state.revokeBeforeProvider) state.acceptances = [];
    await state.transform!({ params: { prompt: [] } });
    return { object: { name: "Treino do aluno", workoutDays: [] } };
  }),
}));

const input = {
  coachId: "coach",
  athleteId: "athlete",
  prompt: "Organize o treino do aluno",
};
const current = (userId: string) => ({
  userId,
  documentVersion: "1.0.1",
  revokedAt: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  state.acceptances = [];
  state.consentReads = [];
  state.linked = true;
  state.allowed = true;
  state.revokeBeforeProvider = false;
  state.transform = undefined;
  state.save.mockResolvedValue({ id: "prescription", version: 1 });
});

describe("Professional generation checks the student's health consent", () => {
  it("does not treat the coach's acceptance as the student's acceptance", async () => {
    state.acceptances = [current("coach")];
    await expect(
      new GenerateCoachPrescriptionDraftWithAi().execute(input),
    ).rejects.toMatchObject({
      code: "ATHLETE_HEALTH_CONSENT_REQUIRED",
      status: 403,
      message: expect.stringContaining(
        "O aluno precisa aceitar a versão atual",
      ),
    });
    expect(state.consentReads).toEqual(["athlete"]);
    expect(generateObject).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("allows a qualified coach to generate with the student's current acceptance even without personal health consent", async () => {
    state.acceptances = [current("athlete")];
    const result = await new GenerateCoachPrescriptionDraftWithAi().execute(
      input,
    );
    expect(result).toMatchObject({
      prescriptionId: "prescription",
      status: "DRAFT",
    });
    expect(state.consentReads).toEqual(["athlete", "athlete"]);
    expect(state.save).toHaveBeenCalledOnce();
    await expect(assertHealthConsent("coach")).rejects.toMatchObject({
      code: "HEALTH_CONSENT_REQUIRED",
    });
  });
  it.each(["old version", "revoked"])(
    "rejects the student's %s acceptance",
    async (condition) => {
      state.acceptances = [
        {
          ...current("athlete"),
          ...(condition === "old version"
            ? { documentVersion: "1.0.0" }
            : { revokedAt: new Date() }),
        },
      ];
      await expect(
        new GenerateCoachPrescriptionDraftWithAi().execute(input),
      ).rejects.toMatchObject({ code: "ATHLETE_HEALTH_CONSENT_REQUIRED" });
      expect(generateObject).not.toHaveBeenCalled();
      expect(state.save).not.toHaveBeenCalled();
    },
  );
  it("retains the student-specific error if consent is revoked immediately before the provider step", async () => {
    state.acceptances = [current("athlete")];
    state.revokeBeforeProvider = true;
    await expect(
      new GenerateCoachPrescriptionDraftWithAi().execute(input),
    ).rejects.toMatchObject({ code: "ATHLETE_HEALTH_CONSENT_REQUIRED" });
    expect(state.save).not.toHaveBeenCalled();
  });
  it.each(["link", "professional access"])(
    "does not inspect consent before authorizing %s",
    async (condition) => {
      state.linked = condition !== "link";
      state.allowed = condition !== "professional access";
      await expect(
        new GenerateCoachPrescriptionDraftWithAi().execute(input),
      ).rejects.toMatchObject({
        code:
          condition === "link"
            ? "ATHLETE_NOT_FOUND"
            : "PROFESSIONAL_VERIFICATION_REQUIRED",
      });
      expect(state.consentReads).toEqual([]);
      expect(generateObject).not.toHaveBeenCalled();
    },
  );
});
