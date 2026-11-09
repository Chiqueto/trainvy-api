import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/db.js";
import { GetCommercialContext } from "../../src/usecases/GetCommercialContext.js";
import { ProfessionalVerificationPolicy } from "../../src/usecases/ProfessionalVerificationPolicy.js";
import { CreateWorkoutPrescriptionDraft } from "../../src/usecases/CreateWorkoutPrescriptionDraft.js";
import { SendWorkoutPrescription } from "../../src/usecases/SendWorkoutPrescription.js";
import { declareTestProfessional } from "../helpers/declared-professional.js";
import { cleanupTestUsers } from "../helpers/test-db.js";

describe("Declared CREF access and retired verification flag", () => {
  const ids: string[] = [];
  let admin: string, coach: string, athlete: string, planId: string;
  const policy = new ProfessionalVerificationPolicy();
  const context = () => new GetCommercialContext().execute({ userId: coach });
  const toggle = async (required: boolean) => policy.update(admin, { required, revision: (await policy.get(admin)).revision, reason: "Synthetic legacy policy compatibility test" });
  const days = [{ name: "Ficha fixture", order: 0, weekDay: "MONDAY" as const, isRest: false, estimatedDurationInSeconds: 1800, exercises: [{ name: "Exercício fixture", order: 0, sets: 3, reps: 10, warmupSets: 0, restTimeInSeconds: 60 }] }];
  const draft = () => new CreateWorkoutPrescriptionDraft().execute({ coachId: coach, athleteId: athlete, name: "Ficha fixture", workoutDays: days });
  beforeAll(async () => {
    for (const role of ["admin", "coach", "athlete"]) {
      const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Declared access fixture", email: `${crypto.randomUUID()}@declared-access.test`, accountType: role === "coach" ? "COACH" : "ATHLETE", systemRole: role === "admin" ? "ADMIN" : "USER", accountSetupCompletedAt: new Date() } });
      ids.push(user.id);
    }
    [admin, coach, athlete] = ids;
    const plan = await prisma.plan.create({ data: { code: `DECLARED_${crypto.randomUUID()}`, name: "Declared fixture", audience: "COACH", monthlyPriceInCents: 0, entitlements: { create: [{ entitlement: "MANAGE_ATHLETES", limitValue: 5 }, { entitlement: "ASSIGN_WORKOUTS" }] } } });
    planId = plan.id;
    await prisma.subscription.create({ data: { userId: coach, planId, status: "ACTIVE", priceInCentsSnapshot: 0, currencySnapshot: "BRL" } });
    await prisma.coachAthlete.create({ data: { coachId: coach, athleteId: athlete, status: "ACTIVE" } });
  });
  beforeEach(async () => {
    await prisma.professionalRegistration.upsert({ where: { userId: coach }, create: { userId: coach, fullName: "Declared fixture", cref: "000000-G", region: "SP", category: "Bacharel" }, update: { status: "PENDING_VERIFICATION", crefVerificationStatus: "UNVERIFIED_SANDBOX", crefDeclaredAt: null } });
    await prisma.userLegalAcceptance.updateMany({ where: { userId: coach }, data: { revokedAt: new Date() } });
  });
  afterAll(async () => {
    await prisma.adminAuditLog.deleteMany({ where: { adminUserId: admin } });
    await prisma.professionalVerificationPolicy.updateMany({ where: { updatedByUserId: admin }, data: { updatedByUserId: null } });
    await cleanupTestUsers(ids);
    await prisma.plan.delete({ where: { id: planId } });
  });
  it("does not allow the legacy flag to grant undeclared access", async () => {
    await toggle(false);
    expect((await context()).professionalAccessGranted).toBe(false);
    await expect(draft()).rejects.toMatchObject({ code: "PROFESSIONAL_VERIFICATION_REQUIRED" });
  });
  it("permits declared access independently of the old verification flag", async () => {
    await declareTestProfessional(coach);
    for (const required of [true, false]) {
      await toggle(required);
      expect(await context()).toMatchObject({ professionalAccessGranted: true, crefVerificationRequired: false });
    }
    expect((await draft()).status).toBe("DRAFT");
  });
  it("requires a current non-revoked declaration acceptance", async () => {
    await declareTestProfessional(coach);
    await prisma.userLegalAcceptance.updateMany({ where: { userId: coach }, data: { revokedAt: new Date() } });
    expect((await context()).professionalAccessGranted).toBe(false);
  });
  it.each(["SUSPENDED", "REJECTED"] as const)("does not bypass %s registrations", async status => {
    await declareTestProfessional(coach);
    await prisma.professionalRegistration.update({ where: { userId: coach }, data: { status } });
    expect((await context()).professionalAccessGranted).toBe(false);
  });
  it("does not require a current administrative verification after declaration", async () => {
    await declareTestProfessional(coach);
    await prisma.professionalRegistration.update({ where: { userId: coach }, data: { status: "VERIFIED", validUntil: new Date("2020-01-01") } });
    expect((await context()).professionalAccessGranted).toBe(true);
  });
  it("keeps professional review and approval mandatory for sending a version", async () => {
    await declareTestProfessional(coach);
    const d = await draft();
    await expect(new SendWorkoutPrescription().execute({ coachId: coach, prescriptionId: d.id, expectedVersion: d.version, approval: false as true })).rejects.toMatchObject({ code: "EXPLICIT_APPROVAL_REQUIRED" });
    const sent = await new SendWorkoutPrescription().execute({ coachId: coach, prescriptionId: d.id, expectedVersion: d.version, approval: true });
    expect(sent.status).toBe("SENT");
    expect(sent.prescribedCrefSnapshot).toContain("000000-G/SP");
  });
  it("does not promote athlete accounts or grant access without a plan", async () => {
    expect((await new GetCommercialContext().execute({ userId: athlete })).professionalAccessGranted).toBe(false);
    await declareTestProfessional(coach);
    await prisma.subscription.update({ where: { userId: coach }, data: { status: "EXPIRED" } });
    await expect(draft()).rejects.toMatchObject({ code: "ASSIGN_WORKOUTS_ENTITLEMENT_REQUIRED" });
    await prisma.subscription.update({ where: { userId: coach }, data: { status: "ACTIVE" } });
  });
});
