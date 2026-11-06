import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateObject } from "ai";
import { GenerateCoachPrescriptionDraftWithAi } from "../../src/usecases/GenerateCoachPrescriptionDraftWithAi.js";
import { assertHealthConsent } from "../../src/usecases/LegalCompliance.js";
import { GenerateAthleteWorkoutPlanDraftWithAi } from "../../src/usecases/GenerateAthleteWorkoutPlanDraftWithAi.js";
import { privateModel } from "../../src/ai/private-model.js";
import { prisma } from "../../src/lib/db.js";

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
      findFirst: vi.fn(async () =>
        state.linked
          ? {
              athlete: {
                id: "athlete",
                name: "Aluno",
                trainingRestrictions: "PRIVATE_HEALTH_SENTINEL",
                trainingGoals: "PRIVATE_GOALS_SENTINEL",
              },
            }
          : null,
      ),
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
vi.mock("../../src/usecases/CheckAndConsumeAiQuota.js", () => ({
  CheckAndConsumeAiQuota: class {
    execute = vi.fn();
  },
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

describe("Professional authorship and personal-data consent are independent", () => {
  it.each(["missing", "old version", "revoked", "current"])(
    "generates and saves the professional draft with the student's %s consent",
    async (condition) => {
      state.acceptances =
        condition === "missing"
          ? []
          : [
              {
                ...current("athlete"),
                ...(condition === "old version"
                  ? { documentVersion: "1.0.0" }
                  : {}),
                ...(condition === "revoked" ? { revokedAt: new Date() } : {}),
              },
            ];
      const result = await new GenerateCoachPrescriptionDraftWithAi().execute(
        input,
      );
      expect(result).toMatchObject({
        prescriptionId: "prescription",
        status: "DRAFT",
      });
      expect(state.consentReads).toEqual([]);
      expect(state.save).toHaveBeenCalledWith(
        expect.objectContaining({
          coachId: "coach",
          athleteId: "athlete",
          aiAssisted: true,
        }),
      );
    },
  );
  it("does not load or insert the student's private profile into the professional AI request", async () => {
    await new GenerateCoachPrescriptionDraftWithAi().execute(input);
    expect(prisma.coachAthlete.findFirst).toHaveBeenCalledWith({
      where: { coachId: "coach", athleteId: "athlete", status: "ACTIVE" },
      include: { athlete: { select: { name: true } } },
    });
    const request = JSON.stringify(vi.mocked(generateObject).mock.calls[0][0]);
    expect(request).not.toContain("PRIVATE_HEALTH_SENTINEL");
    expect(request).not.toContain("PRIVATE_GOALS_SENTINEL");
    expect(request).toContain(input.prompt);
    expect(state.consentReads).toEqual([]);
  });
  it("does not turn revocation into a block on the professional's own instructions", async () => {
    state.acceptances = [current("athlete")];
    state.revokeBeforeProvider = true;
    await expect(
      new GenerateCoachPrescriptionDraftWithAi().execute(input),
    ).resolves.toMatchObject({ status: "DRAFT" });
    expect(state.consentReads).toEqual([]);
  });
  it.each(["missing", "old version", "revoked"])(
    "still requires valid consent when the athlete uses AI with %s consent",
    async (condition) => {
      state.acceptances =
        condition === "missing"
          ? []
          : [
              {
                ...current("athlete"),
                ...(condition === "old version"
                  ? { documentVersion: "1.0.0" }
                  : { revokedAt: new Date() }),
              },
            ];
      await expect(
        new GenerateAthleteWorkoutPlanDraftWithAi().execute({
          userId: "athlete",
          prompt: "Organize minha ficha",
        }),
      ).rejects.toMatchObject({ code: "HEALTH_CONSENT_REQUIRED" });
      expect(generateObject).not.toHaveBeenCalled();
    },
  );
  it("keeps consent checks before provider steps that do read the student's data", async () => {
    state.acceptances = [current("athlete")];
    privateModel([], "athlete", "ATHLETE");
    await expect(
      state.transform!({ params: { prompt: [] } }),
    ).resolves.toBeTruthy();
    state.acceptances = [];
    await expect(
      state.transform!({ params: { prompt: [] } }),
    ).rejects.toMatchObject({ code: "ATHLETE_HEALTH_CONSENT_REQUIRED" });
    await expect(assertHealthConsent("athlete")).rejects.toMatchObject({
      code: "HEALTH_CONSENT_REQUIRED",
    });
  });
  it.each(["link", "professional access"])(
    "continues to require authorized %s",
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
      expect(state.save).not.toHaveBeenCalled();
    },
  );
});
