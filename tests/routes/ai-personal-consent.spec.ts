vi.mock("../../src/usecases/AiAvailability.js", async (original) => ({
  ...(await original()),
  assertAiEnabledForUser: vi.fn(async () => {}),
}));
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText, streamText } from "ai";
import { aiRoutes } from "../../src/routes/ai.js";
import { getPersonalPlanningAiTools } from "../../src/ai/tools.js";
const state = vi.hoisted(() => ({ accepted: false, audits: vi.fn() }));
vi.mock("../../src/usecases/LegalCompliance.js", () => ({
  assertHealthConsent: vi.fn(),
}));
vi.mock("../../src/lib/auth.js", () => ({
  auth: {
    api: {
      getSession: async () => ({ user: { id: "athlete", name: "Aluno" } }),
    },
  },
}));
vi.mock("../../src/lib/db.js", () => ({
  prisma: {
    user: { findUnique: async () => ({ aiTrainingHistoryAccess: false }) },
    aiConversation: { findFirst: async () => ({ id: "c" }) },
  },
}));
vi.mock("../../src/usecases/FeatureTerms.js", () => ({
  FeatureTerms: class {
    async status() {
      return { accepted: state.accepted };
    }
    async authorize(...args: unknown[]) {
      state.audits(...args);
    }
  },
}));
vi.mock("../../src/usecases/GetCommercialContext.js", () => ({
  GetCommercialContext: class {
    async execute() {
      return { professionalAccessGranted: false };
    }
  },
}));
vi.mock("../../src/usecases/CheckAndConsumeAiQuota.js", () => ({
  CheckAndConsumeAiQuota: class {
    async execute() {}
    async getStatus() {
      return {
        currentDailyCount: 1,
        remainingDailyQuota: 4,
        dailyLimit: 5,
        resetAt: "2026-11-04T00:00:00.000Z",
        isAthlete: true,
        planName: "Atleta Grátis",
      };
    }
  },
}));
vi.mock("../../src/usecases/RecordAiUsage.js", () => ({
  recordAiUsage: vi.fn(),
}));
vi.mock("../../src/ai/tools.js", () => ({
  getAiTools: vi.fn(() => ({})),
  getSessionAiTools: vi.fn(() => ({})),
  getProfessionalAiTools: vi.fn(() => ({})),
  getPersonalPlanningAiTools: vi.fn(() => ({})),
}));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText: vi.fn(),
  streamText: vi.fn(),
}));
async function request(text: string) {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(aiRoutes, { prefix: "/ai" });
  try {
    return await app.inject({
      method: "POST",
      url: "/ai",
      payload: {
        conversationId: "f28cd18c-b4f5-4287-9cb5-175e64b73abe",
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text }] }],
      },
    });
  } finally {
    await app.close();
  }
}
describe("personal AI generation gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.accepted = false;
  });
  it.each([false, true])(
    "keeps athlete chat organizational even with legacy personal-generation acceptance (%s)",
    async (accepted) => {
      state.accepted = accepted;
      const response = await request("Crie um treino para mim");
      expect(response.statusCode).toBe(200);
      expect(streamText).not.toHaveBeenCalled();
      expect(generateText).not.toHaveBeenCalled();
      expect(getPersonalPlanningAiTools).not.toHaveBeenCalled();
    },
  );
  it("does not expose personal generation tools for an indirect planning request", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "Posso organizar uma ficha fornecida pelo profissional.",
      usage: {},
    } as never);
    expect(
      (
        await request(
          "Como posso distribuir minhas atividades nos pr?ximos dias para ganhar for?a?",
        )
      ).statusCode,
    ).toBe(200);
    expect(getPersonalPlanningAiTools).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
  });
  it("fails closed if intent classification is unavailable", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(
      new Error("Provider unavailable"),
    );
    expect((await request("Pode me ajudar a ganhar força?")).statusCode).toBe(
      500,
    );
    expect(streamText).not.toHaveBeenCalled();
  });

  it("retorna o status da cota do usuário em GET /ai/quota", async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(aiRoutes, { prefix: "/ai" });
    try {
      const response = await app.inject({ method: "GET", url: "/ai/quota" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        currentDailyCount: 1,
        remainingDailyQuota: 4,
        dailyLimit: 5,
        resetAt: "2026-11-04T00:00:00.000Z",
        isAthlete: true,
        planName: "Atleta Grátis",
      });
    } finally {
      await app.close();
    }
  });
});
