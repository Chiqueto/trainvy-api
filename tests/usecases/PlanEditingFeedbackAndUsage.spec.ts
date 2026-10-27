import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { auth } from "../../src/lib/auth.js";
import { prisma } from "../../src/lib/db.js";
import { workoutEditRoutes } from "../../src/routes/workout-edit.js";
import { sessionFeedbackRoutes } from "../../src/routes/session-feedback.js";
import { adminRoutes } from "../../src/routes/admin.js";
import { sanitizeMessagesForRevokedHistory } from "../../src/routes/ai.js";
import { EditWorkoutPlan, GetEditableWorkoutPlan } from "../../src/usecases/EditWorkoutPlan.js";
import { GetRecentTrainingFeedback, GetSessionFeedback, SaveSessionFeedback } from "../../src/usecases/SessionFeedback.js";
import { StartWorkoutSession } from "../../src/usecases/StartWorkoutSession.js";
import { recordAiUsage, trackAiGeneration } from "../../src/usecases/RecordAiUsage.js";
import { cleanupTestUsers, createTestUser, createTestWorkoutDay, createTestWorkoutExercise, createTestWorkoutPlan, createTestWorkoutSession } from "../helpers/test-db.js";
import type { LanguageModelUsage } from "ai";

const users: string[] = [];
async function user() { const result = await createTestUser(); users.push(result.id); return result; }
async function fixture() {
  const owner = await user();
  const plan = await createTestWorkoutPlan(owner.id);
  const day = await createTestWorkoutDay(plan.id);
  const exercise = await createTestWorkoutExercise(day.id, { name: "Original", warmupSets: 2 });
  return { owner, plan, day, exercise };
}
function body(dayId?: string, exerciseId?: string) {
  return { name: "Plano editado", workoutDays: [{ id: dayId, name: "Treino editado", isRest: false,
    estimatedDurationInSeconds: 2700, exercises: [{ id: exerciseId, name: "Exercício editado", order: 0,
      sets: 4, warmupSets: 1, reps: 8, restTimeInSeconds: 120 }] }] };
}
function login(u: { id: string; name: string; email: string }) {
  vi.spyOn(auth.api, "getSession").mockResolvedValue({ user: { ...u, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
    session: { id: "test", userId: u.id, expiresAt: new Date(Date.now() + 60000), token: "test", createdAt: new Date(), updatedAt: new Date() } } as Awaited<ReturnType<typeof auth.api.getSession>>);
}
const app = Fastify();
beforeAll(async () => {
  app.setValidatorCompiler(validatorCompiler); app.setSerializerCompiler(serializerCompiler);
  await app.register(workoutEditRoutes); await app.register(sessionFeedbackRoutes); await app.register(adminRoutes, { prefix: "/admin" });
  await app.ready();
});
afterEach(async () => { vi.restoreAllMocks(); await cleanupTestUsers(users.splice(0)); });
afterAll(async () => { await app.close(); });

describe("Plan editing ownership and historical snapshots", () => {
  it("edits in place without changing historical prescriptions, sets, activation or rotation IDs", async () => {
    const { owner, plan, day, exercise } = await fixture();
    const started = await new StartWorkoutSession().execute({ userId: owner.id, workoutPlanId: plan.id, workoutDayId: day.id });
    const sessionId = started.userWorkoutSessionId;
    await prisma.workoutSession.update({ where: { id: sessionId }, data: { completedAt: new Date() } });
    const before = await prisma.sessionExercise.findMany({ where: { workoutSessionId: sessionId }, include: { sets: true } });
    await new EditWorkoutPlan().execute(owner.id, plan.id, body(day.id, exercise.id));
    expect(await prisma.sessionExercise.findMany({ where: { workoutSessionId: sessionId }, include: { sets: true } })).toEqual(before);
    const updated = await new GetEditableWorkoutPlan().execute(owner.id, plan.id);
    expect(updated).toMatchObject({ id: plan.id, name: "Plano editado", isActive: true });
    expect(updated.workoutDays[0]).toMatchObject({ id: day.id, name: "Treino editado" });
    expect(updated.workoutDays[0].exercises[0]).toMatchObject({ id: exercise.id, sets: 4, reps: 8, warmupSets: 1 });
    const historical = await prisma.workoutSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(historical.workoutDayNameSnapshot).toBe(day.name);
  });
  it("preserves session snapshots when a prescribed day is removed", async () => {
    const { owner, plan, day } = await fixture();
    const started = await new StartWorkoutSession().execute({ userId: owner.id, workoutPlanId: plan.id, workoutDayId: day.id });
    await prisma.workoutSession.update({ where: { id: started.userWorkoutSessionId }, data: { completedAt: new Date() } });
    await new EditWorkoutPlan().execute(owner.id, plan.id, body());
    const historical = await prisma.workoutSession.findUniqueOrThrow({ where: { id: started.userWorkoutSessionId }, include: { sessionExercises: true } });
    expect(historical.workoutDayId).toBeNull();
    expect(historical.workoutDayNameSnapshot).toBe(day.name);
    expect(historical.sessionExercises[0].exerciseNameSnapshot).toBe("Original");
  });
  it("blocks active sessions and prevents cross-user plan/day/exercise access atomically", async () => {
    const { owner, plan, day, exercise } = await fixture();
    const other = await fixture();
    await expect(new EditWorkoutPlan().execute(other.owner.id, plan.id, body(day.id))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(new EditWorkoutPlan().execute(owner.id, plan.id, body(other.day.id))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(new EditWorkoutPlan().execute(owner.id, plan.id, body(day.id, other.exercise.id))).rejects.toMatchObject({ code: "NOT_FOUND" });
    const privateExercise = await prisma.exercise.create({ data: { name: "Privado", ownerUserId: other.owner.id } });
    const invalid = body(day.id, exercise.id);
    Object.assign(invalid.workoutDays[0].exercises[0], { exerciseId: privateExercise.id });
    await expect(new EditWorkoutPlan().execute(owner.id, plan.id, invalid)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await createTestWorkoutSession(day.id);
    await expect(new EditWorkoutPlan().execute(owner.id, plan.id, body(day.id, exercise.id))).rejects.toMatchObject({ code: "ACTIVE_WORKOUT_SESSION" });
    expect((await prisma.workoutPlan.findUniqueOrThrow({ where: { id: plan.id } })).name).toBe(plan.name);
  });
  it("validates HTTP contracts and requires authentication", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValue(null);
    expect((await app.inject({ url: `/workout-plans/${crypto.randomUUID()}/edit` })).statusCode).toBe(401);
    const { owner, plan, day, exercise } = await fixture(); login(owner);
    const invalid = body(day.id, exercise.id); invalid.workoutDays[0].exercises[0].sets = 1.5;
    expect((await app.inject({ method: "PUT", url: `/workout-plans/${plan.id}`, payload: invalid })).statusCode).toBe(400);
    const saved = await app.inject({ method: "PUT", url: `/workout-plans/${plan.id}`, payload: body(day.id, exercise.id) });
    expect(saved.statusCode).toBe(200);
    const read = await app.inject({ url: `/workout-plans/${plan.id}/edit` });
    expect(read.statusCode).toBe(200); expect(read.json().workoutDays[0].exercises[0].id).toBe(exercise.id);
  });
});

describe("Post-workout feedback persistence", () => {
  it("redacts prior feedback tool results when history consent is revoked", () => {
    const messages = [{ id: "message", role: "assistant", parts: [{ type: "tool-getRecentTrainingFeedback", toolCallId: "call", state: "output-available", input: {}, output: { notes: "private recovery note" } }] }] as Parameters<typeof sanitizeMessagesForRevokedHistory>[0];
    const result = sanitizeMessagesForRevokedHistory(messages);
    expect(JSON.stringify(result)).not.toContain("private recovery note");
    expect(JSON.stringify(messages)).toContain("private recovery note");
  });
  it("upserts one feedback per completed session, preserving zeros and later edits", async () => {
    const { owner, day } = await fixture();
    const session = await createTestWorkoutSession(day.id, { completedAt: new Date() });
    expect(await new GetSessionFeedback().execute(owner.id, session.id)).toBeNull();
    await new SaveSessionFeedback().execute(owner.id, session.id, { feeling: "great", pain: 0, fatigue: 2, notes: "Boa sessão" });
    expect(await new GetSessionFeedback().execute(owner.id, session.id)).toMatchObject({ feeling: "great", pain: 0, fatigue: 2, notes: "Boa sessão" });
    await new SaveSessionFeedback().execute(owner.id, session.id, { feeling: "fatigued", pain: null, notes: null });
    expect(await prisma.workoutSessionFeedback.count({ where: { workoutSessionId: session.id } })).toBe(1);
    expect(await new GetSessionFeedback().execute(owner.id, session.id)).toMatchObject({ feeling: "fatigued", pain: null, notes: null });
  });
  it("rejects foreign and incomplete sessions and invalid ratings", async () => {
    const { owner, day } = await fixture(); const other = await user();
    const session = await createTestWorkoutSession(day.id);
    await expect(new SaveSessionFeedback().execute(owner.id, session.id, { feeling: "great" })).rejects.toMatchObject({ code: "SESSION_NOT_COMPLETED" });
    await expect(new GetSessionFeedback().execute(other.id, session.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(new SaveSessionFeedback().execute(other.id, session.id, { feeling: "great" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    login(owner);
    const invalid = await app.inject({ method: "PUT", url: `/workout-sessions/${session.id}/feedback`, payload: { feeling: "great", pain: 11 } });
    expect(invalid.statusCode).toBe(400);
  });
  it("makes persisted feedback available to AI only after history consent", async () => {
    const { owner, day } = await fixture();
    const session = await createTestWorkoutSession(day.id, { completedAt: new Date() });
    await new SaveSessionFeedback().execute(owner.id, session.id, { feeling: "intense", fatigue: 8 });
    expect(await new GetRecentTrainingFeedback().execute(owner.id)).toEqual({ consentRequired: true, feedback: [] });
    await prisma.user.update({ where: { id: owner.id }, data: { aiTrainingHistoryAccess: true } });
    const result = await new GetRecentTrainingFeedback().execute(owner.id);
    expect(result.feedback).toHaveLength(1); expect(result.feedback[0].fatigue).toBe(8);
  });
});

describe("AI usage recording and admin authorization", () => {
  const usage = { inputTokens: 1000, outputTokens: 200, inputTokenDetails: { cacheReadTokens: 100 }, outputTokenDetails: { reasoningTokens: 50 } } as LanguageModelUsage;
  it("records provider usage without commercial side effects and shows filtered admin totals", async () => {
    const admin = await user(); const caller = await user();
    await prisma.user.update({ where: { id: admin.id }, data: { systemRole: "ADMIN" } });
    await trackAiGeneration({ userId: caller.id, feature: "ATHLETE_PLAN" }, async () => ({ usage, object: {} }));
    await recordAiUsage({ userId: caller.id, feature: "CHAT" }, undefined, "ERROR");
    login(caller);
    expect((await app.inject({ url: "/admin/ai-usage" })).statusCode).toBe(403);
    login(admin);
    const response = await app.inject({ url: `/admin/ai-usage?days=7&userId=${caller.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().totals).toMatchObject({ calls: 2, inputTokens: 1000, outputTokens: 200, reasoningTokens: 50, cachedInputTokens: 100, unpricedCalls: 1, errors: 1 });
    expect(response.json().totals.estimatedCostUsd).toBeCloseTo(0.000773, 9);
    expect(response.json().byUser).toHaveLength(1);
    expect(response.json().daily[0].calls).toBe(2);
    expect((await app.inject({ url: "/admin/ai-usage?days=999" })).statusCode).toBe(400);
  });
  it("records failures even when there is no token report and preserves the original error", async () => {
    const caller = await user(); const error = new Error("Provider failed");
    await expect(trackAiGeneration({ userId: caller.id, feature: "COACH_INSIGHTS" }, async () => { throw error; })).rejects.toBe(error);
    expect(await prisma.aiUsageEvent.findFirst({ where: { userId: caller.id } })).toMatchObject({ status: "ERROR", inputTokens: null, estimatedCostUsd: null });
  });
});
