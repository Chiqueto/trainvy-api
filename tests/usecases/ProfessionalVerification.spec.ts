import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { prisma } from "../../src/lib/db.js";
import { ProfessionalVerification } from "../../src/usecases/ProfessionalVerification.js";
import { CreateWorkoutPrescriptionDraft } from "../../src/usecases/CreateWorkoutPrescriptionDraft.js";
import { UpdateWorkoutPrescriptionDraft } from "../../src/usecases/UpdateWorkoutPrescriptionDraft.js";
import { SendWorkoutPrescription } from "../../src/usecases/SendWorkoutPrescription.js";
import { AcceptWorkoutPrescription } from "../../src/usecases/AcceptWorkoutPrescription.js";
import { GetWorkoutPrescriptionDetails } from "../../src/usecases/GetWorkoutPrescriptionDetails.js";
import { EditWorkoutPlan } from "../../src/usecases/EditWorkoutPlan.js";
import { CreateWorkoutPlan } from "../../src/usecases/CreateWorkoutPlan.js";
import { planningRoutes } from "../../src/routes/planning.js";
import { auth } from "../../src/lib/auth.js";
import { signImportPreview } from "../../src/domain/workout-import.js";
import { cleanupTestUsers } from "../helpers/test-db.js";

vi.mock("../../src/lib/auth.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
describe("Professional verification, approval and personal imports", () => {
  const service = new ProfessionalVerification();
  const ids: string[] = [];
  let admin: string,
    coach: string,
    athlete: string,
    other: string,
    planId: string;
  const days = [
    {
      name: "Ficha informada",
      order: 0,
      weekDay: "MONDAY" as const,
      isRest: false,
      estimatedDurationInSeconds: 1800,
      exercises: [
        {
          name: "Supino",
          order: 0,
          sets: 3,
          reps: 10,
          warmupSets: 0,
          restTimeInSeconds: 90,
        },
      ],
    },
  ];
  const review = () => ({
    revision: 1,
    result: "VERIFIED" as const,
    sourceUrl: "https://www.confef.org.br/confef/registrados/",
    evidence: "Nome, número, categoria e situação conferidos na fonte oficial.",
    identityMatched: true,
    identityVerificationMethod: "LIVE_IDENTITY_CHECK" as const,
    identityEvidenceReference: "Synthetic QA identity check",
    registrationActive: true,
    scopeConfirmed: true,
    checkedAt: new Date(Date.now() - 1000).toISOString(),
    publicReason: "Registro e habilitação confirmados.",
  });
  const register = () =>
    service.submit(coach, {
      fullName: "Profissional Teste",
      cref: "123456-G",
      region: "SP",
      category: "Bacharel",
    });
  async function verify() {
    const r = await register();
    return service.review(admin, coach, { ...review(), revision: r.revision });
  }
  async function draft() {
    await verify();
    return new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach,
      athleteId: athlete,
      name: "Ficha",
      workoutDays: days,
    });
  }
  beforeAll(async () => {
    for (const type of ["admin", "coach", "athlete", "other"]) {
      const id = crypto.randomUUID();
      ids.push(id);
      await prisma.user.create({
        data: {
          id,
          name: `Policy ${type}`,
          email: `${id}@policy.test`,
          accountType: type === "coach" ? "COACH" : "ATHLETE",
          systemRole: type === "admin" ? "ADMIN" : "USER",
          accountSetupCompletedAt: new Date(),
        },
      });
    }
    [admin, coach, athlete, other] = ids;
    const plan = await prisma.plan.create({
      data: {
        code: `policy-${crypto.randomUUID()}`,
        name: "Policy",
        audience: "COACH",
        monthlyPriceInCents: 0,
        entitlements: {
          create: [
            { entitlement: "ASSIGN_WORKOUTS" },
            { entitlement: "MANAGE_ATHLETES" },
          ],
        },
      },
    });
    planId = plan.id;
    await prisma.subscription.create({
      data: {
        userId: coach,
        planId,
        status: "ACTIVE",
        priceInCentsSnapshot: 0,
        currencySnapshot: "BRL",
      },
    });
    await prisma.coachAthlete.create({
      data: { coachId: coach, athleteId: athlete },
    });
  });
  afterAll(async () => {
    await prisma.professionalVerificationReview.deleteMany({
      where: { userId: { in: ids } },
    });
    await cleanupTestUsers(ids);
    await prisma.plan.delete({ where: { id: planId } });
  });
  it("blocks an unverified coach with a paid entitlement", async () => {
    await expect(
      new CreateWorkoutPrescriptionDraft().execute({
        coachId: coach,
        athleteId: athlete,
        name: "A",
        workoutDays: days,
      }),
    ).rejects.toMatchObject({ code: "PROFESSIONAL_VERIFICATION_REQUIRED" });
  });
  it("stores pending registration without granting professional access", async () => {
    const r = await register();
    expect(r.status).toBe("PENDING_VERIFICATION");
    expect(r.validUntil).toBeNull();
  });
  it("rejects self review and a non-admin reviewer", async () => {
    await expect(service.review(coach, coach, review())).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
    });
    await expect(service.review(other, coach, review())).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
    });
  });
  it("rejects wrong identity, inactive registration or incompatible scope", async () => {
    for (const field of [
      "identityMatched",
      "registrationActive",
      "scopeConfirmed",
    ]) {
      const r = await register();
      await expect(
        service.review(admin, coach, {
          ...review(),
          revision: r.revision,
          [field]: false,
        }),
      ).rejects.toMatchObject({ code: "VERIFICATION_EVIDENCE_INSUFFICIENT" });
    }
  });
  it("does not approve when the source is unavailable", async () => {
    const r = await register();
    const result = await service.review(admin, coach, {
      ...review(),
      revision: r.revision,
      result: "PENDING_VERIFICATION",
      registrationActive: false,
      scopeConfirmed: false,
      publicReason: "Fonte indisponível; aguarde nova consulta.",
    });
    expect(result.status).toBe("PENDING_VERIFICATION");
  });
  it("records verified evidence with a deadline and rejects stale review", async () => {
    const r = await verify();
    expect(r.status).toBe("VERIFIED");
    expect(r.validUntil).not.toBeNull();
    await expect(
      service.review(admin, coach, { ...review(), revision: r.revision - 1 }),
    ).rejects.toMatchObject({ code: "CONCURRENCY_CONFLICT" });
    expect(
      await prisma.professionalVerificationReview.count({
        where: { userId: coach },
      }),
    ).toBeGreaterThan(0);
  });
  it.each(["SUSPENDED", "EXPIRED"] as const)(
    "blocks new drafts for %s",
    async (status) => {
      await prisma.professionalRegistration.update({
        where: { userId: coach },
        data: { status },
      });
      await expect(
        new CreateWorkoutPrescriptionDraft().execute({
          coachId: coach,
          athleteId: athlete,
          name: "A",
          workoutDays: days,
        }),
      ).rejects.toMatchObject({ code: "PROFESSIONAL_VERIFICATION_REQUIRED" });
    },
  );
  it("creates and edits a draft and rejects stale approval", async () => {
    const d = await draft();
    expect(d.status).toBe("DRAFT");
    const updated = await new UpdateWorkoutPrescriptionDraft().execute({
      coachId: coach,
      prescriptionId: d.id,
      name: "Revisada",
      expectedVersion: d.version,
      workoutDays: days,
    });
    expect(updated.version).toBe(2);
    await expect(
      new SendWorkoutPrescription().execute({
        coachId: coach,
        prescriptionId: d.id,
        expectedVersion: 1,
        approval: true,
      }),
    ).rejects.toMatchObject({ code: "CONCURRENCY_CONFLICT" });
  });
  it("blocks publication without explicit approval and rechecks verification", async () => {
    const d = await draft();
    await expect(
      new SendWorkoutPrescription().execute({
        coachId: coach,
        prescriptionId: d.id,
        expectedVersion: 1,
        approval: false as true,
      }),
    ).rejects.toMatchObject({ code: "EXPLICIT_APPROVAL_REQUIRED" });
    await prisma.professionalRegistration.update({
      where: { userId: coach },
      data: { status: "SUSPENDED" },
    });
    await expect(
      new SendWorkoutPrescription().execute({
        coachId: coach,
        prescriptionId: d.id,
        expectedVersion: 1,
        approval: true,
      }),
    ).rejects.toMatchObject({ code: "PROFESSIONAL_VERIFICATION_REQUIRED" });
  });
  it("serializes editing and approval and keeps the published snapshot immutable", async () => {
    const d = await draft();
    const results = await Promise.allSettled([
      new SendWorkoutPrescription().execute({
        coachId: coach,
        prescriptionId: d.id,
        expectedVersion: 1,
        approval: true,
      }),
      new UpdateWorkoutPrescriptionDraft().execute({
        coachId: coach,
        prescriptionId: d.id,
        name: "Concorrente",
        expectedVersion: 1,
        workoutDays: days,
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const saved = await prisma.workoutPrescription.findUniqueOrThrow({
      where: { id: d.id },
    });
    if (saved.status === "SENT") {
      expect(saved.approvedVersion).toBe(1);
      expect(saved.approvedByUserId).toBe(coach);
      expect(saved.approvedSnapshot).not.toBeNull();
    }
  });
  it("keeps personal manual plans available without a coach", async () => {
    const plan = await new CreateWorkoutPlan().execute({
      userId: other,
      name: "Pessoal",
      activate: false,
      workoutDays: days,
    });
    expect(plan.id).toBeTruthy();
  });
  it("does not expose another athlete's prescription", async () => {
    const d = await draft();
    await expect(
      new GetWorkoutPrescriptionDetails().execute({
        userId: other,
        prescriptionId: d.id,
      }),
    ).rejects.toMatchObject({ code: "PRESCRIPTION_NOT_FOUND" });
  });
  it("removes approval association when a student edits the personal copy", async () => {
    const d = await draft();
    await new SendWorkoutPrescription().execute({
      coachId: coach,
      prescriptionId: d.id,
      expectedVersion: 1,
      approval: true,
    });
    const accepted = await new AcceptWorkoutPrescription().execute({
      athleteId: athlete,
      prescriptionId: d.id,
    });
    await new EditWorkoutPlan().execute(athlete, accepted.workoutPlanId, {
      name: "Minha cópia",
      workoutDays: days,
    });
    const original = await prisma.workoutPrescription.findUniqueOrThrow({
      where: { id: d.id },
    });
    expect(original.acceptedWorkoutPlanId).toBeNull();
    expect(original.approvedSnapshot).not.toBeNull();
  });
  it("requires confirmation, binds import to owner, saves provenance and prevents replay", async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(planningRoutes, { prefix: "/planning" });
    const token = signImportPreview({
      userId: other,
      sourceHash: "digest",
      sourceType: "application/pdf",
      extracted: { name: null, workoutDays: [], provenance: [], questions: [] },
    });
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: other },
    } as never);
    const body = { previewToken: token, name: "Importado", workoutDays: days };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/planning/imports/confirm",
          payload: body,
        })
      ).statusCode,
    ).toBe(400);
    const result = await app.inject({
      method: "POST",
      url: "/planning/imports/confirm",
      payload: { ...body, confirmed: true },
    });
    expect(result.statusCode).toBe(201);
    const saved = await prisma.workoutPlan.findUniqueOrThrow({
      where: { id: result.json().id },
    });
    expect(saved.isActive).toBe(false);
    expect(saved.importProvenance).toMatchObject({
      sourceHash: "digest",
      professionalApproval: false,
      confirmedBy: other,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/planning/imports/confirm",
          payload: { ...body, confirmed: true },
        })
      ).statusCode,
    ).toBe(409);
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: athlete },
    } as never);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/planning/imports/confirm",
          payload: { ...body, confirmed: true },
        })
      ).statusCode,
    ).toBe(400);
    await app.close();
  });
});
