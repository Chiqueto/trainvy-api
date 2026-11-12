import { declareTestProfessional } from "../helpers/declared-professional.js";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Fastify, { FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { auth } from "../../src/lib/auth.js";
import { prisma } from "../../src/lib/db.js";
import { coachRoutes } from "../../src/routes/coach.js";
import { coachPrescriptionRoutes } from "../../src/routes/coach-prescription.js";

describe("Coach & Athlete HTTP Routes", () => {
  let app: FastifyInstance;
  let coachUser: { id: string; email: string; name: string };
  let athleteUser: { id: string; email: string; name: string };

  beforeAll(async () => {
    app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(coachRoutes);
    await app.register(coachPrescriptionRoutes);
    await app.ready();

    // Cria plano com entitlement
    const plan = await prisma.plan.create({
      data: {
        code: `ROUTE_COACH_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: "Route Coach Plan",
        audience: "COACH",
        monthlyPriceInCents: 4990,
        currency: "BRL",
        isActive: true,
        isPublic: true,
        entitlements: {
          create: [
            { entitlement: "COACH_DASHBOARD", limitValue: null },
            { entitlement: "MANAGE_ATHLETES", limitValue: 5 },
            { entitlement: "ASSIGN_WORKOUTS", limitValue: null },
          ],
        },
      },
    });

    coachUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Route Coach",
        email: `route-coach-${Date.now()}@coach.test`,
        accountType: "COACH",
        professionalRegistration: {
          create: {
            fullName: "Verified Fixture",
            cref: "123456-G",
            region: "SP",
            category: "Bacharel",
            status: "VERIFIED",
            verifiedAt: new Date(),
            validUntil: new Date("2099-01-01"),
          },
        },
        accountSetupCompletedAt: new Date(),
      },
    });
    await declareTestProfessional(coachUser.id);

    await prisma.subscription.create({
      data: {
        userId: coachUser.id,
        planId: plan.id,
        status: "ACTIVE",
        priceInCentsSnapshot: 4990,
        currencySnapshot: "BRL",
        currentPeriodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    athleteUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Route Athlete",
        email: `route-ath-${Date.now()}@athlete.test`,
        accountType: "ATHLETE",
        accountSetupCompletedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /coach/invitations — retorna 401 para requisição sem autenticação", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null as any);

    const response = await app.inject({
      method: "POST",
      url: "/coach/invitations",
      payload: {},
    });

    expect(response.statusCode).toBe(401);
  });

  it("POST /coach/invitations — cria convite com status 201 quando autenticado", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s1", userId: coachUser.id } as any,
    } as any);

    const response = await app.inject({
      method: "POST",
      url: "/coach/invitations",
      payload: { expiresInDays: 7 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.id).toBeDefined();
    expect(body.token).toBeDefined();
    expect(body.expiresAt).toBeDefined();
  });

  it("GET /coach/invitations/preview/:token — retorna 200 e preview público sem exigir auth", async () => {
    // Cria convite primeiro
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s1", userId: coachUser.id } as any,
    } as any);

    const createRes = await app.inject({
      method: "POST",
      url: "/coach/invitations",
      payload: {},
    });
    const { token } = createRes.json();

    const previewRes = await app.inject({
      method: "GET",
      url: `/coach/invitations/preview/${token}`,
    });

    expect(previewRes.statusCode).toBe(200);
    const preview = previewRes.json();
    expect(preview.isValid).toBe(true);
    expect(preview.coach.id).toBe(coachUser.id);
  });

  it("POST /coach/invitations/accept — atleta aceita convite com 200", async () => {
    // Cria convite
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s1", userId: coachUser.id } as any,
    } as any);

    const createRes = await app.inject({
      method: "POST",
      url: "/coach/invitations",
      payload: {},
    });
    const { token } = createRes.json();

    // Atleta aceita
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: athleteUser,
      session: { id: "s2", userId: athleteUser.id } as any,
    } as any);

    const acceptRes = await app.inject({
      method: "POST",
      url: "/coach/invitations/accept",
      payload: { token },
    });

    expect(acceptRes.statusCode).toBe(200);
    const acceptBody = acceptRes.json();
    expect(acceptBody.success).toBe(true);
    expect(acceptBody.link.status).toBe("ACTIVE");
  });

  it("GET /me/coach-relationship — retorna o treinador ativo do atleta", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: athleteUser,
      session: { id: "s2", userId: athleteUser.id } as any,
    } as any);

    const response = await app.inject({
      method: "GET",
      url: "/me/coach-relationship",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.hasCoach).toBe(true);
    expect(body.relationship.coachId).toBe(coachUser.id);
  });

  it("GET /coach/athletes — treinador lista seus alunos ativos", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s1", userId: coachUser.id } as any,
    } as any);

    const response = await app.inject({
      method: "GET",
      url: "/coach/athletes",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.activeCount).toBe(1);
    expect(body.athletes.length).toBe(1);
    expect(body.athletes[0].athleteId).toBe(athleteUser.id);
    expect(body.athletes[0]).toHaveProperty("evolutionShared");
    expect(body.athletes[0]).toHaveProperty("hasActiveWorkoutPlan");
    expect(body.athletes[0]).toHaveProperty("workoutsThisWeekCount");
    expect(body.athletes[0]).toHaveProperty("pendingPrescriptionsCount");
    expect(body.summary).toBeDefined();
    expect(body.summary.totalAthletes).toBe(1);
  });

  it("GET /coach/athletes/:athleteId — treinador consulta detalhes do aluno ativo", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s1", userId: coachUser.id } as any,
    } as any);

    const response = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.athleteId).toBe(athleteUser.id);
    expect(body.name).toBe(athleteUser.name);
    expect(body.email).toBe(athleteUser.email);
    expect(body.status).toBe("ACTIVE");
    expect(body.acceptedAt).toBeDefined();
  });

  it("GET /coach/athletes/:athleteId — 404 para aluno inexistente ou não vinculado (IDOR defense)", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s1", userId: coachUser.id } as any,
    } as any);

    const response = await app.inject({
      method: "GET",
      url: `/coach/athletes/${crypto.randomUUID()}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it("DELETE /me/coach-relationship/:linkId — atleta encerra vínculo com sucesso", async () => {
    // Pega o link atual
    const link = await prisma.coachAthlete.findFirst({
      where: { athleteId: athleteUser.id, status: "ACTIVE" },
    });
    expect(link).not.toBeNull();

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: athleteUser,
      session: { id: "s2", userId: athleteUser.id } as any,
    } as any);

    const response = await app.inject({
      method: "DELETE",
      url: `/me/coach-relationship/${link!.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);

    const linkAfter = await prisma.coachAthlete.findUnique({
      where: { id: link!.id },
    });
    expect(linkAfter?.status).toBe("REVOKED");
  });

  it("persiste os guias por conta e mantém painel e editor independentes", async () => {
    const signIn = () =>
      vi
        .spyOn(auth.api, "getSession")
        .mockResolvedValueOnce({ user: coachUser } as any);
    signIn();
    const initial = await app.inject({
      method: "GET",
      url: "/coach/onboarding",
    });
    expect(initial.json()).toEqual({
      coachOnboardingCompleted: false,
      workoutBuilderOnboardingCompleted: false,
    });
    signIn();
    const updated = await app.inject({
      method: "PATCH",
      url: "/coach/onboarding",
      payload: { tour: "workspace" },
    });
    expect(updated.json()).toEqual({
      coachOnboardingCompleted: true,
      workoutBuilderOnboardingCompleted: false,
    });
    signIn();
    const again = await app.inject({ method: "GET", url: "/coach/onboarding" });
    expect(again.json().coachOnboardingCompleted).toBe(true);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: athleteUser.id } }))
        .coachOnboardingCompleted,
    ).toBe(false);
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: athleteUser,
    } as any);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/coach/onboarding",
          payload: { tour: "builder" },
        })
      ).statusCode,
    ).toBe(403);
  });

  it.each([
    ["GET", "/coach/onboarding", undefined],
    ["PATCH", "/coach/onboarding", { tour: "builder" }],
    ["POST", "/coach/managed-athletes", { name: "Aluno" }],
  ] as const)("%s %s exige autenticação", async (method, url, payload) => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null as any);
    expect((await app.inject({ method, url, payload })).statusCode).toBe(401);
  });

  it("cadastra sem login, preserva fichas no aceite e não consome outra vaga", async () => {
    const signIn = () =>
      vi
        .spyOn(auth.api, "getSession")
        .mockResolvedValueOnce({ user: coachUser } as any);
    signIn();
    const created = await app.inject({
      method: "POST",
      url: "/coach/managed-athletes",
      payload: { name: "Aluno sem conta" },
    });
    expect(created.statusCode).toBe(201);
    const { athleteId } = created.json();
    const managed = await prisma.user.findUniqueOrThrow({
      where: { id: athleteId },
      include: { accounts: true, sessions: true },
    });
    expect(managed.isManagedProfile).toBe(true);
    expect(managed.accounts).toHaveLength(0);
    expect(managed.sessions).toHaveLength(0);
    signIn();
    const details = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteId}`,
    });
    expect(details.json()).toMatchObject({ email: "", isManagedProfile: true });
    signIn();
    const draftResponse = await app.inject({
      method: "POST",
      url: "/coach/prescriptions",
      payload: {
        athleteId,
        name: "Ficha preparada",
        workoutDays: [
          {
            name: "Treino A",
            isRest: false,
            estimatedDurationInSeconds: 1800,
            exercises: [
              {
                name: "Supino",
                order: 0,
                sets: 3,
                reps: 10,
                restTimeInSeconds: 60,
              },
            ],
          },
        ],
      },
    });
    expect(draftResponse.statusCode).toBe(201);
    const draft = draftResponse.json();
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { userId: coachUser.id },
    });
    const entitlement = await prisma.planEntitlement.findFirstOrThrow({
      where: { planId: subscription.planId, entitlement: "MANAGE_ATHLETES" },
    });
    const count = await prisma.coachAthlete.count({
      where: { coachId: coachUser.id, status: "ACTIVE" },
    });
    await prisma.planEntitlement.update({
      where: { id: entitlement.id },
      data: { limitValue: count },
    });
    try {
      signIn();
      const atCapacity = await app.inject({
        method: "POST",
        url: "/coach/managed-athletes",
        payload: { name: "Sem vaga" },
      });
      expect(atCapacity.statusCode).toBe(409);
      signIn();
      const invite = await app.inject({
        method: "POST",
        url: "/coach/invitations",
        payload: { managedAthleteId: athleteId },
      });
      expect(invite.statusCode).toBe(201);
      signIn();
      const secondInvite = await app.inject({
        method: "POST",
        url: "/coach/invitations",
        payload: { managedAthleteId: athleteId },
      });
      const { token } = invite.json();
      const preview = await app.inject({
        method: "GET",
        url: `/coach/invitations/preview/${token}`,
      });
      expect(preview.json().isValid).toBe(true);
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: athleteUser,
      } as any);
      const accepted = await app.inject({
        method: "POST",
        url: "/coach/invitations/accept",
        payload: { token },
      });
      expect(accepted.statusCode).toBe(200);
      const prescription = await prisma.workoutPrescription.findUniqueOrThrow({
        where: { id: draft.id },
      });
      expect(prescription.athleteId).toBe(athleteUser.id);
      expect(prescription.status).toBe("DRAFT");
      expect(prescription.name).toBe("Ficha preparada");
      expect(prescription.payload).toEqual(draft.payload);
      const link = await prisma.coachAthlete.findUniqueOrThrow({
        where: { id: accepted.json().link.id },
      });
      expect(link.evolutionShared).toBe(false);
      expect(
        await prisma.coachAthlete.count({
          where: { coachId: coachUser.id, status: "ACTIVE" },
        }),
      ).toBe(count);
      const oldInvite = await app.inject({
        method: "GET",
        url: `/coach/invitations/preview/${secondInvite.json().token}`,
      });
      expect(oldInvite.json().isValid).toBe(false);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: athleteId } }))
          .deletedAt,
      ).not.toBeNull();
      await prisma.coachAthlete.update({
        where: { id: link.id },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revokedByUserId: athleteUser.id,
        },
      });
    } finally {
      await prisma.planEntitlement.update({
        where: { id: entitlement.id },
        data: { limitValue: entitlement.limitValue },
      });
    }
  });

  it("não permite convidar cadastro de outro personal nem usar conta real como cadastro provisório", async () => {
    const other = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Cadastro alheio",
        email: `${crypto.randomUUID()}@managed.invalid`,
        isManagedProfile: true,
      },
    });
    for (const managedAthleteId of [other.id, athleteUser.id]) {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: coachUser,
      } as any);
      const result = await app.inject({
        method: "POST",
        url: "/coach/invitations",
        payload: { managedAthleteId },
      });
      expect(result.statusCode).toBe(404);
    }
  });

  it("GET /coach/athletes/:athleteId — retorna 404 imediatamente após encerramento do vínculo", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s1", userId: coachUser.id } as any,
    } as any);

    const response = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}`,
    });

    expect(response.statusCode).toBe(404);
  });
});
