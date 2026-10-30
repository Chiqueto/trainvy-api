import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText, streamText } from "ai";
import { aiRoutes } from "../../src/routes/ai.js";
import { getPersonalPlanningAiTools } from "../../src/ai/tools.js";
const state = vi.hoisted(() => ({ accepted: false, audits: vi.fn() }));
vi.mock("../../src/lib/auth.js", () => ({ auth: { api: { getSession: async () => ({ user: { id: "athlete", name: "Aluno" } }) } } }));
vi.mock("../../src/lib/db.js", () => ({ prisma: {
  user: { findUnique: async () => ({ aiTrainingHistoryAccess: false }) },
  aiConversation: { findFirst: async () => ({ id: "c" }) },
} }));
vi.mock("../../src/usecases/FeatureTerms.js", () => ({ FeatureTerms: class {
  async status() { return { accepted: state.accepted }; }
  async authorize(...args: unknown[]) { state.audits(...args); }
} }));
vi.mock("../../src/usecases/GetCommercialContext.js", () => ({ GetCommercialContext: class { async execute() { return { professionalAccessGranted: false }; } } }));
vi.mock("../../src/usecases/CheckAndConsumeAiQuota.js", () => ({ CheckAndConsumeAiQuota: class { async execute() {} } }));
vi.mock("../../src/usecases/RecordAiUsage.js", () => ({ recordAiUsage: vi.fn() }));
vi.mock("../../src/ai/tools.js", () => ({ getAiTools: vi.fn(() => ({})), getSessionAiTools: vi.fn(() => ({})), getProfessionalAiTools: vi.fn(() => ({})), getPersonalPlanningAiTools: vi.fn(() => ({})) }));
vi.mock("ai", async original => ({ ...(await original<typeof import("ai")>()), generateText: vi.fn(), streamText: vi.fn() }));
async function request(text: string) {
  const app = Fastify(); app.setValidatorCompiler(validatorCompiler); app.setSerializerCompiler(serializerCompiler);
  await app.register(aiRoutes, { prefix: "/ai" });
  try { return await app.inject({ method: "POST", url: "/ai", payload: { conversationId: "f28cd18c-b4f5-4287-9cb5-175e64b73abe", messages: [{ id: "u1", role: "user", parts: [{ type: "text", text }] }] } }); }
  finally { await app.close(); }
}
describe("personal AI generation gate", () => {
  beforeEach(() => { vi.clearAllMocks(); state.accepted = false; });
  it("requests consent before any generation for a direct request", async () => {
    const response = await request("Crie um treino para mim");
    expect(response.statusCode).toBe(428);
    expect(response.json()).toMatchObject({ code: "FEATURE_TERMS_REQUIRED", feature: "AI_WORKOUT" });
    expect(generateText).not.toHaveBeenCalled(); expect(streamText).not.toHaveBeenCalled();
  });
  it("uses semantic intent detection for indirect requests without generating a plan", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: { requiresWorkoutGeneration: true }, usage: {} } as never);
    expect((await request("Como posso distribuir minhas atividades nos próximos dias para ganhar força?")).statusCode).toBe(428);
    expect(generateText).toHaveBeenCalledOnce(); expect(streamText).not.toHaveBeenCalled();
    expect(getPersonalPlanningAiTools).not.toHaveBeenCalled();
  });
  it("unlocks personal drafts and audits generation after persisted acceptance", async () => {
    state.accepted = true;
    vi.mocked(streamText).mockReturnValueOnce({ toUIMessageStreamResponse: () => new Response("generated") } as never);
    const response = await request("Crie um treino para mim");
    expect(response.statusCode).toBe(200); expect(streamText).toHaveBeenCalledOnce();
    expect(getPersonalPlanningAiTools).toHaveBeenCalledWith("athlete", expect.anything());
    expect(state.audits).toHaveBeenCalledWith("athlete", "AI_WORKOUT", expect.stringContaining(":generation"));
  });
  it("fails closed if intent classification is unavailable", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error("Provider unavailable"));
    expect((await request("Pode me ajudar a ganhar força?")).statusCode).toBe(500);
    expect(streamText).not.toHaveBeenCalled();
  });
});
