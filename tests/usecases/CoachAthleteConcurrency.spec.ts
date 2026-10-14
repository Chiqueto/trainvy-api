import { describe, expect, it } from "vitest";

import { CoachAthleteError } from "../../src/domain/coach-athlete.js";
import { prisma } from "../../src/lib/db.js";
import { AcceptCoachInvitation } from "../../src/usecases/AcceptCoachInvitation.js";
import { CancelCoachInvitation } from "../../src/usecases/CancelCoachInvitation.js";
import { CreateCoachInvitation } from "../../src/usecases/CreateCoachInvitation.js";

describe("TASK 6.1.1 — Concorrência, Limites Comerciais e Transições Atômicas", () => {
  // Helpers isolados de criação de dados
  const createCoach = async (
    prefix: string,
    options: { customAthleteLimit?: number; status?: "ACTIVE" | "EXPIRED" } = {},
  ) => {
    const { customAthleteLimit = 5, status = "ACTIVE" } = options;
    const email = `conc-coach-${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@coach.test`;

    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: `Coach ${prefix}`,
        email,
        accountType: "COACH",
        accountSetupCompletedAt: new Date(),
      },
    });

    const planCode = `PLAN_${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const plan = await prisma.plan.create({
      data: {
        code: planCode,
        name: "Concurrency Test Plan",
        audience: "COACH",
        monthlyPriceInCents: 4990,
        currency: "BRL",
        isActive: true,
        isPublic: true,
        entitlements: {
          create: [
            { entitlement: "COACH_DASHBOARD", limitValue: null },
            { entitlement: "MANAGE_ATHLETES", limitValue: customAthleteLimit },
          ],
        },
      },
    });

    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status,
        priceInCentsSnapshot: 4990,
        currencySnapshot: "BRL",
        currentPeriodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
        currentPeriodEnd:
          status === "ACTIVE"
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            : new Date(Date.now() - 1000),
      },
    });

    return { user, plan };
  };

  const createAthlete = async (prefix: string, accountType: "ATHLETE" | "COACH" = "ATHLETE") => {
    const email = `conc-ath-${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@ath.test`;
    return prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: `Athlete ${prefix}`,
        email,
        accountType,
        accountSetupCompletedAt: new Date(),
      },
    });
  };

  it("Cenário A — Dois atletas disputam a última vaga simultaneamente: exatamente 1 é aceito e o banco não excede o limite", async () => {
    // Coach com limite de 1 vaga
    const { user: coach } = await createCoach("scen-a", { customAthleteLimit: 1 });
    const athlete1 = await createAthlete("scen-a-1");
    const athlete2 = await createAthlete("scen-a-2");

    const inv1 = await new CreateCoachInvitation().execute({ coachId: coach.id });
    const inv2 = await new CreateCoachInvitation().execute({ coachId: coach.id });

    // Dispara os aceites simultaneamente
    const results = await Promise.allSettled([
      new AcceptCoachInvitation().execute({ athleteId: athlete1.id, token: inv1.token }),
      new AcceptCoachInvitation().execute({ athleteId: athlete2.id, token: inv2.token }),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const rejected = failures[0] as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(CoachAthleteError);
    expect((rejected.reason as CoachAthleteError).code).toBe("ATHLETE_LIMIT_REACHED");

    // Valida diretamente no banco: o limite nunca foi ultrapassado
    const activeCountInDb = await prisma.coachAthlete.count({
      where: { coachId: coach.id, status: "ACTIVE" },
    });
    expect(activeCountInDb).toBe(1);
  });

  it("Cenário B — Dez atletas tentam aceitar simultaneamente quando há apenas 3 vagas: exatamente 3 sucedem e 7 são rejeitados", async () => {
    const { user: coach } = await createCoach("scen-b", { customAthleteLimit: 3 });

    // Cria 10 atletas e 10 convites
    const athletes = await Promise.all(
      Array.from({ length: 10 }).map((_, i) => createAthlete(`scen-b-${i}`)),
    );
    const invites = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        new CreateCoachInvitation().execute({ coachId: coach.id }),
      ),
    );

    // Dispara todos concorrentemente
    const results = await Promise.allSettled(
      athletes.map((ath, i) =>
        new AcceptCoachInvitation().execute({ athleteId: ath.id, token: invites[i].token }),
      ),
    );

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    expect(successes.length).toBe(3);
    expect(failures.length).toBe(7);

    // Todos os que falharam receberam erro de limite
    for (const fail of failures) {
      const err = (fail as PromiseRejectedResult).reason;
      expect(err).toBeInstanceOf(CoachAthleteError);
      expect((err as CoachAthleteError).code).toBe("ATHLETE_LIMIT_REACHED");
    }

    // Validação estrita de banco
    const activeCountInDb = await prisma.coachAthlete.count({
      where: { coachId: coach.id, status: "ACTIVE" },
    });
    expect(activeCountInDb).toBe(3);
  });

  it("Cenário C — O mesmo convite recebe dois aceites simultâneos: exatamente 1 vincula e o outro falha", async () => {
    const { user: coach } = await createCoach("scen-c", { customAthleteLimit: 5 });
    const athlete1 = await createAthlete("scen-c-1");
    const athlete2 = await createAthlete("scen-c-2");

    // 1 único convite
    const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });

    // Ambos tentam aceitar o mesmo token simultaneamente
    const results = await Promise.allSettled([
      new AcceptCoachInvitation().execute({ athleteId: athlete1.id, token: inv.token }),
      new AcceptCoachInvitation().execute({ athleteId: athlete2.id, token: inv.token }),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const rejected = failures[0] as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(CoachAthleteError);
    expect(
      ["INVITATION_ALREADY_USED", "CONCURRENT_OPERATION_CONFLICT"].includes(
        (rejected.reason as CoachAthleteError).code,
      ),
    ).toBe(true);

    // Validação no banco: exatamente 1 vínculo criado para esse convite
    const linksInDb = await prisma.coachAthlete.findMany({
      where: { invitationId: inv.id },
    });
    expect(linksInDb.length).toBe(1);

    const invInDb = await prisma.coachInvitation.findUnique({
      where: { id: inv.id },
    });
    expect(invInDb?.status).toBe("ACCEPTED");
    expect([athlete1.id, athlete2.id].includes(invInDb!.acceptedByAthleteId!)).toBe(true);
  });

  it("Cenário D — Treinador perde elegibilidade comercial antes do aceite: aceite é bloqueado", async () => {
    const { user: coach } = await createCoach("scen-d", { customAthleteLimit: 5 });
    const athlete = await createAthlete("scen-d-ath");

    const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });

    // Treinador tem sua assinatura cancelada/expirada
    await prisma.subscription.update({
      where: { userId: coach.id },
      data: {
        status: "EXPIRED",
        currentPeriodEnd: new Date(Date.now() - 1000),
      },
    });

    await expect(
      new AcceptCoachInvitation().execute({ athleteId: athlete.id, token: inv.token }),
    ).rejects.toMatchObject({
      code: "MANAGE_ATHLETES_ENTITLEMENT_REQUIRED",
      status: 403,
    });
  });

  it("Cenário E — Limite comercial é reduzido administrativamente antes do aceite: bloqueia se activeCount >= novo limite", async () => {
    const { user: coach, plan } = await createCoach("scen-e", { customAthleteLimit: 2 });
    const athlete1 = await createAthlete("scen-e-1");
    const athlete2 = await createAthlete("scen-e-2");

    const inv1 = await new CreateCoachInvitation().execute({ coachId: coach.id });
    const inv2 = await new CreateCoachInvitation().execute({ coachId: coach.id });

    // Aceita 1 atleta
    await new AcceptCoachInvitation().execute({ athleteId: athlete1.id, token: inv1.token });

    // Administrador reduz o limite do plano para 1 (ou seja, coach já atingiu o limite)
    await prisma.planEntitlement.update({
      where: {
        planId_entitlement: {
          planId: plan.id,
          entitlement: "MANAGE_ATHLETES",
        },
      },
      data: { limitValue: 1 },
    });

    // 2º atleta tenta aceitar com convite que havia sido gerado antes
    await expect(
      new AcceptCoachInvitation().execute({ athleteId: athlete2.id, token: inv2.token }),
    ).rejects.toMatchObject({
      code: "ATHLETE_LIMIT_REACHED",
      status: 409,
    });
  });

  it("Cenário F — Corrida entre Cancelamento e Aceite simultâneos: transição atômica garante que apenas uma vence", async () => {
    const { user: coach } = await createCoach("scen-f", { customAthleteLimit: 5 });
    const athlete = await createAthlete("scen-f-ath");

    const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });

    // Dispara Cancelar e Aceitar simultaneamente
    const results = await Promise.allSettled([
      new CancelCoachInvitation().execute({ coachId: coach.id, invitationId: inv.id }),
      new AcceptCoachInvitation().execute({ athleteId: athlete.id, token: inv.token }),
    ]);

    const cancelRes = results[0];
    const acceptRes = results[1];

    const invInDb = await prisma.coachInvitation.findUnique({
      where: { id: inv.id },
    });

    const linksInDb = await prisma.coachAthlete.findMany({
      where: { invitationId: inv.id },
    });

    if (cancelRes.status === "fulfilled" && acceptRes.status === "rejected") {
      // Cancel venceu
      expect(invInDb?.status).toBe("CANCELLED");
      expect(linksInDb.length).toBe(0);
    } else if (acceptRes.status === "fulfilled" && cancelRes.status === "rejected") {
      // Aceite venceu
      expect(invInDb?.status).toBe("ACCEPTED");
      expect(linksInDb.length).toBe(1);
    } else if (cancelRes.status === "fulfilled" && acceptRes.status === "fulfilled") {
      // Impossível: ambas não podem vencer
      expect.fail("Ambas as operações concorrentes foram consideradas bem-sucedidas!");
    }
  });

  it("Cenário G — Restrição de tipo de conta: conta COACH não pode aceitar convite como aluno", async () => {
    const { user: coach } = await createCoach("scen-g", { customAthleteLimit: 5 });
    const coachAsAthlete = await createAthlete("coach-trying-to-be-student", "COACH");

    const inv = await new CreateCoachInvitation().execute({ coachId: coach.id });

    await expect(
      new AcceptCoachInvitation().execute({ athleteId: coachAsAthlete.id, token: inv.token }),
    ).rejects.toMatchObject({
      code: "ONLY_ATHLETES_CAN_ACCEPT",
      status: 403,
    });
  });
});
