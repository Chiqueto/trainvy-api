import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { prisma } from "../../src/lib/db.js";
import { auth } from "../../src/lib/auth.js";
import { professionalVerificationRoutes } from "../../src/routes/professional-verification.js";
import {
  ProfessionalVerificationPolicy,
  readProfessionalVerificationPolicy,
} from "../../src/usecases/ProfessionalVerificationPolicy.js";
import { ProfessionalVerification } from "../../src/usecases/ProfessionalVerification.js";
import { GetCommercialContext } from "../../src/usecases/GetCommercialContext.js";
import { CreateWorkoutPrescriptionDraft } from "../../src/usecases/CreateWorkoutPrescriptionDraft.js";
import { SendWorkoutPrescription } from "../../src/usecases/SendWorkoutPrescription.js";
import { AcceptWorkoutPrescription } from "../../src/usecases/AcceptWorkoutPrescription.js";
import { assertCoachCanManageAthletes } from "../../src/domain/coach-athlete.js";
import { cleanupTestUsers } from "../helpers/test-db.js";
vi.mock("../../src/lib/auth.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
describe("Admin CREF test policy and search", () => {
  const policy = new ProfessionalVerificationPolicy(),
    registry = new ProfessionalVerification();
  const ids: string[] = [];
  let admin: string, coach: string, athlete: string, planId: string;
  const app = Fastify();
  const days = [
    {
      name: "Treino de teste",
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
  const draft = () =>
    new CreateWorkoutPrescriptionDraft().execute({
      coachId: coach,
      athleteId: athlete,
      name: "Teste CREF",
      workoutDays: days,
    });
  const toggle = async (required: boolean) =>
    policy.update(admin, {
      required,
      revision: (await policy.get(admin)).revision,
      reason: "Teste automatizado de configuração CREF",
    });
  beforeAll(async () => {
    for (const kind of ["admin", "coach", "athlete"]) {
      const id = crypto.randomUUID();
      ids.push(id);
      await prisma.user.create({
        data: {
          id,
          name: `CREF ${kind}`,
          email: `${id}@cref-policy.test`,
          accountType: kind === "coach" ? "COACH" : "ATHLETE",
          systemRole: kind === "admin" ? "ADMIN" : "USER",
          accountSetupCompletedAt: new Date(),
        },
      });
    }
    [admin, coach, athlete] = ids;
    const plan = await prisma.plan.create({
      data: {
        code: `CREF_POLICY_${crypto.randomUUID()}`,
        name: "CREF tests",
        audience: "COACH",
        monthlyPriceInCents: 0,
        entitlements: {
          create: [
            { entitlement: "ASSIGN_WORKOUTS" },
            { entitlement: "MANAGE_ATHLETES", limitValue: 10 },
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
        currencySnapshot: "BRL",
        priceInCentsSnapshot: 0,
      },
    });
    await prisma.coachAthlete.create({
      data: { coachId: coach, athleteId: athlete },
    });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(professionalVerificationRoutes);
  });
  beforeEach(async () => {
    await toggle(true);
    await prisma.professionalRegistration.updateMany({
      where: { userId: coach },
      data: { status: "PENDING_VERIFICATION" },
    });
    await registry.submit(coach, {
      fullName: "Busca Profissional CREF",
      cref: "987654-G",
      region: "SP",
      category: "Bacharel",
    });
  });
  afterEach(async () => {
    await toggle(true);
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await app.close();
    await prisma.adminAuditLog.deleteMany({ where: { adminUserId: admin } });
    await prisma.professionalVerificationPolicy.update({
      where: { id: "global" },
      data: { updatedByUserId: null },
    });
    await cleanupTestUsers(ids);
    await prisma.plan.delete({ where: { id: planId } });
  });
  it("defaults to requiring verification and blocks a pending professional", async () => {
    expect((await readProfessionalVerificationPolicy()).required).toBe(true);
    await expect(draft()).rejects.toMatchObject({
      code: "PROFESSIONAL_VERIFICATION_REQUIRED",
    });
  });
  it("permits only persisted admins to read or change the flag", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    expect(
      (await app.inject({ url: "/admin/professional-verification-policy" }))
        .statusCode,
    ).toBe(401);
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: athlete, systemRole: "ADMIN" },
    } as never);
    expect(
      (await app.inject({ url: "/admin/professional-verification-policy" }))
        .statusCode,
    ).toBe(403);
    const current = await policy.get(admin);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/admin/professional-verification-policy",
          payload: {
            required: false,
            revision: current.revision,
            reason: "Tentativa sem autorização",
          },
        })
      ).statusCode,
    ).toBe(403);
    expect((await policy.get(admin)).required).toBe(true);
  });
  it("releases test access without changing registration status and records an audit", async () => {
    const before = await policy.get(admin);
    const updated = await toggle(false);
    expect(updated.required).toBe(false);
    const context = await new GetCommercialContext().execute({ userId: coach });
    expect(context.professionalAccessGranted).toBe(true);
    expect(context.professionalVerification?.status).toBe(
      "PENDING_VERIFICATION",
    );
    expect(() => assertCoachCanManageAthletes(context)).not.toThrow();
    expect(()=>assertCoachCanManageAthletes({...context,entitlements:[]})).toThrow();
    expect((await draft()).status).toBe("DRAFT");
    const audit = await prisma.adminAuditLog.findFirstOrThrow({
      where: {
        adminUserId: admin,
        action: "PROFESSIONAL_VERIFICATION_POLICY_UPDATED",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.before).toMatchObject({ required: before.required });
    expect(audit.after).toMatchObject({ required: false });
    expect(audit.metadata).toMatchObject({ reason: expect.any(String) });
  });
  it("does not turn student accounts into professionals", async () => {
    await toggle(false);
    const context = await new GetCommercialContext().execute({
      userId: athlete,
    });
    expect(context.professionalAccessGranted).toBe(false);
    expect(() => assertCoachCanManageAthletes(context)).toThrow();
  });
  it("permits testing when no CREF registration was submitted",async()=>{
    await toggle(false);await prisma.professionalRegistration.delete({where:{userId:coach}});
    const context=await new GetCommercialContext().execute({userId:coach});
    expect(context.professionalVerification).toBeNull();expect(context.professionalAccessGranted).toBe(true);
    expect((await draft()).status).toBe("DRAFT");
  });
  it.each(["REJECTED", "SUSPENDED"] as const)(
    "does not bypass a %s registration",
    async (status) => {
      await toggle(false);
      await prisma.professionalRegistration.update({
        where: { userId: coach },
        data: { status },
      });
      expect(
        (await new GetCommercialContext().execute({ userId: coach }))
          .professionalAccessGranted,
      ).toBe(false);
      await expect(draft()).rejects.toMatchObject({
        code: "PROFESSIONAL_VERIFICATION_REQUIRED",
      });
      const updated = await registry.submit(coach, {
        fullName: "Busca Profissional CREF",
        cref: "987655-G",
        region: "SP",
        category: "Bacharel",
      });
      expect(updated.status).toBe(status);
      expect(
        (await new GetCommercialContext().execute({ userId: coach }))
          .professionalAccessGranted,
      ).toBe(false);
    },
  );
  it("rejects stale updates instead of silently overwriting another admin", async () => {
    const current = await policy.get(admin);
    await toggle(false);
    await expect(
      policy.update(admin, {
        required: true,
        revision: current.revision,
        reason: "Configuração desatualizada",
      }),
    ).rejects.toMatchObject({ code: "CONCURRENCY_CONFLICT" });
    expect((await policy.get(admin)).required).toBe(false);
  });
  it("marks test approvals and blocks new acceptance when verification is restored", async () => {
    await toggle(false);
    const d = await draft();
    const sent = await new SendWorkoutPrescription().execute({
      coachId: coach,
      prescriptionId: d.id,
      expectedVersion: d.version,
      approval: true,
    });
    expect(sent.approvalMode).toBe("TEST");
    const record = await prisma.workoutPrescription.findUniqueOrThrow({
      where: { id: d.id },
    });
    expect(record.approvedSnapshot).toMatchObject({ verificationMode: "TEST" });
    await toggle(true);
    await expect(draft()).rejects.toMatchObject({
      code: "PROFESSIONAL_VERIFICATION_REQUIRED",
    });
    await expect(
      new AcceptWorkoutPrescription().execute({
        athleteId: athlete,
        prescriptionId: d.id,
      }),
    ).rejects.toMatchObject({ code: "TEST_PRESCRIPTION_DISABLED" });
    expect(
      (
        await prisma.workoutPrescription.findUniqueOrThrow({
          where: { id: d.id },
        })
      ).acceptedWorkoutPlanId,
    ).toBeNull();
  });
  it("preserves personal plans already accepted during tests", async () => {
    await toggle(false);
    const d = await draft();
    await new SendWorkoutPrescription().execute({
      coachId: coach,
      prescriptionId: d.id,
      expectedVersion: d.version,
      approval: true,
    });
    const accepted = await new AcceptWorkoutPrescription().execute({
      athleteId: athlete,
      prescriptionId: d.id,
    });
    await toggle(true);
    expect(
      await prisma.workoutPlan.findUnique({
        where: { id: accepted.workoutPlanId },
      }),
    ).not.toBeNull();
    expect(
      (
        await prisma.workoutPrescription.findUniqueOrThrow({
          where: { id: d.id },
        })
      ).approvedSnapshot,
    ).toMatchObject({ verificationMode: "TEST" });
  });
  it("serializes policy activation and test publication", async () => {
    await toggle(false);
    const d = await draft();
    const [activation, publication] = await Promise.allSettled([
      toggle(true),
      new SendWorkoutPrescription().execute({
        coachId: coach,
        prescriptionId: d.id,
        expectedVersion: d.version,
        approval: true,
      }),
    ]);
    expect(activation.status).toBe("fulfilled");
    expect((await policy.get(admin)).required).toBe(true);
    if (publication.status === "fulfilled")
      expect(publication.value.approvalMode).toBe("TEST");
    else
      expect(publication.reason).toMatchObject({
        code: "PROFESSIONAL_VERIFICATION_REQUIRED",
      });
  });
  it("searches by registration, case-insensitive name and region", async () => {
    expect(
      (await registry.list(admin, { q: "987654" })).some(
        (r) => r.userId === coach,
      ),
    ).toBe(true);
    expect(
      (
        await registry.list(admin, { q: "busca profissional", region: "SP" })
      ).some((r) => r.userId === coach),
    ).toBe(true);
    expect(
      (await registry.list(admin, { q: "987654-G/SP" })).some(
        (r) => r.userId === coach,
      ),
    ).toBe(true);
    expect(
      (await registry.list(admin, { q: "987654", region: "RJ" })).some(
        (r) => r.userId === coach,
      ),
    ).toBe(false);
    await expect(registry.list(athlete, { q: "987654" })).rejects.toMatchObject(
      { code: "ADMIN_REQUIRED" },
    );
  });
});
