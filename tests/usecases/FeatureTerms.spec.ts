import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getFeatureTerms } from "../../src/domain/feature-terms.js";
import { prisma } from "../../src/lib/db.js";
import { FeatureTerms } from "../../src/usecases/FeatureTerms.js";
import { ListFeatureTermsEvidence } from "../../src/usecases/ListFeatureTermsEvidence.js";

const ownerId = crypto.randomUUID();
const otherId = crypto.randomUUID();
const adminId = crypto.randomUUID();
const ids = [ownerId, otherId, adminId];
const service = new FeatureTerms();
describe("Feature terms PostgreSQL persistence", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: ids.map(id => ({ id, name: "Consent test", email: `terms-${id}@fitai.test`, systemRole: id === adminId ? "ADMIN" as const : "USER" as const })) });
  });
  afterAll(async () => {
    await prisma.featureAccessEvent.deleteMany({ where: { acceptance: { userId: { in: ids } } } });
    await prisma.featureTermsAcceptance.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });
  it("fails closed before acceptance", async () => {
    await expect(service.authorize(ownerId, "AI_WORKOUT", "generation")).rejects.toMatchObject({ code: "FEATURE_TERMS_REQUIRED" });
  });
  it("persists exact terms and one immutable receipt even with concurrent retries", async () => {
    const t = getFeatureTerms("AI_WORKOUT");
    const input = { userId: ownerId, feature: t.feature, version: t.version, textHash: t.textHash, ipAddress: "127.0.0.1", userAgent: "Integration test browser" };
    const receipts = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      service.accept({ ...input, ipAddress: `127.0.0.${index + 1}`, userAgent: `Concurrent browser ${index}` }),
    ));
    const first = receipts[0];
    expect(first.accepted).toBe(true);
    expect(first.acceptanceId).toBeTruthy();
    expect(new Set(receipts.map(receipt => receipt.acceptanceId)).size).toBe(1);
    expect(new Set(receipts.map(receipt => receipt.acceptedAt)).size).toBe(1);
    const saved = await prisma.featureTermsAcceptance.findUniqueOrThrow({ where: { id: first.acceptanceId! } });
    expect(saved.text).toBe(t.text); expect(saved.textHash).toBe(t.textHash); expect(saved.title).toBe(t.title);
    await service.accept({ ...input, ipAddress: "192.0.2.1", userAgent: "Changed" });
    const again = await prisma.featureTermsAcceptance.findUniqueOrThrow({ where: { id: first.acceptanceId! } });
    expect(again.userAgent).toBe(saved.userAgent); expect(again.acceptedAt).toEqual(saved.acceptedAt);
    expect(again.ipAddress).toBe(saved.ipAddress);
    expect(saved.userAgent).toMatch(/^Concurrent browser \d+$/);
    const winningRequest = Number(saved.userAgent!.split(" ").at(-1));
    expect(saved.ipAddress).toBe(`127.0.0.${winningRequest + 1}`);
    expect(await prisma.featureTermsAcceptance.count({ where: { userId: ownerId } })).toBe(1);
  });
  it("keeps features and accounts isolated and refuses stale terms", async () => {
    expect((await service.status(ownerId, "EXERCISE_3D")).accepted).toBe(false);
    expect((await service.status(otherId, "AI_WORKOUT")).accepted).toBe(false);
    await expect(service.accept({ userId: ownerId, feature: "AI_WORKOUT", version: "old", textHash: "0".repeat(64), ipAddress: "127.0.0.1" })).rejects.toMatchObject({ code: "FEATURE_TERMS_CHANGED" });
  });
  it("links feature use to the receipt and restricts evidence to administrators", async () => {
    const event = await service.authorize(ownerId, "AI_WORKOUT", "conversation:tool-call:generation");
    const evidence = await new ListFeatureTermsEvidence().execute(adminId, { userId: ownerId, limit: 25 });
    expect(evidence.items).toHaveLength(1);
    expect(evidence.items[0].id).toBe(event.acceptanceId);
    expect(evidence.items[0].accessCount).toBe(1);
    expect(evidence.items[0].recentAccessEvents[0].id).toBe(event.id);
    await expect(new ListFeatureTermsEvidence().execute(otherId, { userId: ownerId, limit: 25 })).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
  });
});
