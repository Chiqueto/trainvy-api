import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { featureTermsRoutes } from "../../src/routes/feature-terms.js";
import { FeatureTerms } from "../../src/usecases/FeatureTerms.js";
import { getFeatureTerms } from "../../src/domain/feature-terms.js";
import { getPersonalPlanningAiTools } from "../../src/ai/tools.js";

const state = vi.hoisted(() => ({
  userId: "user-a" as string | null,
  rows: new Map<string, any>(),
  events: [] as any[],
}));
vi.mock("../../src/lib/auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () =>
        state.userId ? { user: { id: state.userId } } : null,
      ),
    },
  },
}));
vi.mock("../../src/lib/db.js", () => ({
  prisma: {
    featureTermsAcceptance: {
      findUnique: vi.fn(
        async ({ where }) =>
          state.rows.get(
            JSON.stringify(where.userId_feature_version_textHash),
          ) ?? null,
      ),
      upsert: vi.fn(async ({ where, create }) => {
        const key = JSON.stringify(where.userId_feature_version_textHash);
        if (!state.rows.has(key))
          state.rows.set(key, {
            ...create,
            id: crypto.randomUUID(),
            acceptedAt: new Date(),
          });
        return state.rows.get(key);
      }),
    },
    featureAccessEvent: {
      create: vi.fn(async ({ data }) => {
        const event = { ...data, id: crypto.randomUUID() };
        state.events.push(event);
        return event;
      }),
    },
  },
}));

async function app() {
  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  await server.register(featureTermsRoutes);
  return server;
}
const url = "/me/feature-terms/AI_WORKOUT";
const payload = () => {
  const t = getFeatureTerms("AI_WORKOUT");
  return { accepted: true, version: t.version, textHash: t.textHash };
};
describe("persisted feature acknowledgement", () => {
  beforeEach(() => {
    state.userId = "user-a";
    state.rows.clear();
    state.events = [];
  });
  it("revalidates consent on personal tool executions, including pending approvals", async () => {
    const tools = getPersonalPlanningAiTools("user-a");
    expect(tools.createWorkoutPlanDraft.needsApproval).toBe(true);
    expect(tools).not.toHaveProperty("sendWorkoutPrescription");
    await expect(tools.createWorkoutPlanDraft.execute!({} as never, {} as never)).rejects.toMatchObject({ code: "FEATURE_TERMS_REQUIRED" });
    await expect(tools.proposeWorkoutPlan.execute!({} as never, {} as never)).rejects.toMatchObject({ code: "FEATURE_TERMS_REQUIRED" });
    const t = getFeatureTerms("AI_WORKOUT");
    await new FeatureTerms().accept({ userId: "user-a", feature: "AI_WORKOUT", version: t.version, textHash: t.textHash, ipAddress: "127.0.0.1" });
    const proposal = { name: "Pessoal", workoutDays: [] };
    await expect(tools.proposeWorkoutPlan.execute!(proposal, {} as never)).resolves.toMatchObject({ status: "PROPOSED" });
    expect(state.events).toHaveLength(1);
    // A terms update or removed/stale acceptance cannot be bypassed by a previously created factory.
    state.rows.clear();
    await expect(tools.proposeWorkoutPlan.execute!(proposal, {} as never)).rejects.toMatchObject({ code: "FEATURE_TERMS_REQUIRED" });
  });
  it("requires a session for reading and accepting", async () => {
    state.userId = null;
    const server = await app();
    expect((await server.inject({ url })).statusCode).toBe(401);
    expect(
      (
        await server.inject({
          method: "POST",
          url: url + "/accept",
          payload: payload(),
        })
      ).statusCode,
    ).toBe(401);
    expect(state.rows.size).toBe(0);
    await server.close();
  });
  it("cannot authorize use without acceptance", async () => {
    const server = await app();
    expect(
      (
        await server.inject({
          method: "POST",
          url: url + "/access",
          payload: { context: "chat" },
        })
      ).statusCode,
    ).toBe(428);
    expect(state.events).toHaveLength(0);
    await server.close();
  });
  it("rejects false acknowledgement, stale versions, hashes and forged ownership", async () => {
    const server = await app();
    for (const body of [
      { ...payload(), accepted: false },
      { ...payload(), version: "old" },
      { ...payload(), textHash: "0".repeat(64) },
      { ...payload(), userId: "victim" },
    ]) {
      const result = await server.inject({
        method: "POST",
        url: url + "/accept",
        payload: body,
      });
      expect([400, 409]).toContain(result.statusCode);
    }
    expect(state.rows.size).toBe(0);
    await server.close();
  });
  it("stores the exact server terms, server timestamp and request evidence idempotently", async () => {
    const server = await app();
    const first = await server.inject({
      method: "POST",
      url: url + "/accept",
      payload: payload(),
      headers: { "user-agent": "Test browser" },
    });
    expect(first.statusCode).toBe(200);
    const second = await server.inject({
      method: "POST",
      url: url + "/accept",
      payload: payload(),
      headers: { "user-agent": "Changed" },
    });
    expect(second.json().acceptanceId).toBe(first.json().acceptanceId);
    const row = [...state.rows.values()][0];
    expect(row.text).toBe(getFeatureTerms("AI_WORKOUT").text);
    expect(row.userAgent).toBe("Test browser");
    expect(row.acceptedAt).toBeInstanceOf(Date);
    expect(row.ipAddress).toBeTruthy();
    expect(state.rows.size).toBe(1);
    await server.close();
  });
  it("isolates both users and features, and links accesses to accepted evidence", async () => {
    const server = await app();
    await server.inject({
      method: "POST",
      url: url + "/accept",
      payload: payload(),
    });
    expect(
      (await new FeatureTerms().status("user-a", "EXERCISE_3D")).accepted,
    ).toBe(false);
    expect(
      (await new FeatureTerms().status("user-b", "AI_WORKOUT")).accepted,
    ).toBe(false);
    const result = await server.inject({
      method: "POST",
      url: url + "/access",
      payload: { context: "chat:conversation-id:generation" },
    });
    expect(result.statusCode).toBe(200);
    expect(state.events[0].acceptanceId).toBe([...state.rows.values()][0].id);
    state.userId = "user-b";
    expect(
      (
        await server.inject({
          method: "POST",
          url: url + "/access",
          payload: { context: "chat" },
        })
      ).statusCode,
    ).toBe(428);
    await server.close();
  });
});
