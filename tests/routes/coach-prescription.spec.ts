/* eslint-disable @typescript-eslint/no-explicit-any */
import Fastify, { FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { auth } from "../../src/lib/auth.js";
import { prisma } from "../../src/lib/db.js";
import { coachPrescriptionRoutes } from "../../src/routes/coach-prescription.js";
import { ActivateWorkoutPlan } from "../../src/usecases/ActivateWorkoutPlan.js";

describe("Coach Workout Prescriptions Integration Tests", () => {
  let app: FastifyInstance;
  let coachUser: { id: string; email: string; name: string };
  let athleteUser: { id: string; email: string; name: string };
  let secondAthlete: { id: string; email: string; name: string };
  let coachWithoutEntitlement: { id: string; email: string; name: string };
  let activeLinkId: string;

  const validWorkoutDays = [
    {
      name: "Treino A - Peito e Tríceps",
      order: 0,
      weekDay: "MONDAY" as const,
      isRest: false,
      estimatedDurationInSeconds: 3600,
      exercises: [
        {
          order: 0,
          name: "Supino Reto com Barra",
          sets: 4,
          warmupSets: 1,
          reps: 10,
          restTimeInSeconds: 90,
        },
        {
          order: 1,
          name: "Tríceps Corda",
          sets: 3,
          warmupSets: 0,
          reps: 12,
          restTimeInSeconds: 60,
        },
      ],
    },
    {
      name: "Descanso Ativo",
      order: 1,
      weekDay: "TUESDAY" as const,
      isRest: true,
      estimatedDurationInSeconds: 0,
      exercises: [],
    },
  ];

  beforeAll(async () => {
    app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(coachPrescriptionRoutes);
    await app.ready();

    // 1. Plano com ASSIGN_WORKOUTS e MANAGE_ATHLETES
    const fullCoachPlan = await prisma.plan.create({
      data: {
        code: `PRESCRIPTION_COACH_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: "Prescription Coach Plan",
        audience: "COACH",
        monthlyPriceInCents: 9900,
        currency: "BRL",
        isActive: true,
        isPublic: true,
        entitlements: {
          create: [
            { entitlement: "COACH_DASHBOARD", limitValue: null },
            { entitlement: "MANAGE_ATHLETES", limitValue: 10 },
            { entitlement: "ASSIGN_WORKOUTS", limitValue: null },
          ],
        },
      },
    });

    // 2. Plano sem ASSIGN_WORKOUTS
    const limitedPlan = await prisma.plan.create({
      data: {
        code: `LIMITED_COACH_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: "Limited Coach Plan",
        audience: "COACH",
        monthlyPriceInCents: 2900,
        currency: "BRL",
        isActive: true,
        isPublic: true,
        entitlements: {
          create: [
            { entitlement: "COACH_DASHBOARD", limitValue: null },
            { entitlement: "MANAGE_ATHLETES", limitValue: 2 },
          ],
        },
      },
    });

    // 3. Usuários
    coachUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Prescribing Coach",
        email: `presc-coach-${Date.now()}@coach.test`,
        accountType: "COACH",
        accountSetupCompletedAt: new Date(),
      },
    });

    await prisma.subscription.create({
      data: {
        userId: coachUser.id,
        planId: fullCoachPlan.id,
        status: "ACTIVE",
        priceInCentsSnapshot: 9900,
        currencySnapshot: "BRL",
        currentPeriodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    coachWithoutEntitlement = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Limited Coach",
        email: `limited-coach-${Date.now()}@coach.test`,
        accountType: "COACH",
        accountSetupCompletedAt: new Date(),
      },
    });

    await prisma.subscription.create({
      data: {
        userId: coachWithoutEntitlement.id,
        planId: limitedPlan.id,
        status: "ACTIVE",
        priceInCentsSnapshot: 2900,
        currencySnapshot: "BRL",
        currentPeriodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    athleteUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Target Athlete",
        email: `target-ath-${Date.now()}@athlete.test`,
        accountType: "ATHLETE",
        accountSetupCompletedAt: new Date(),
      },
    });

    secondAthlete = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Unrelated Athlete",
        email: `unrelated-ath-${Date.now()}@athlete.test`,
        accountType: "ATHLETE",
        accountSetupCompletedAt: new Date(),
      },
    });

    // Estabelece vínculo ativo entre coachUser e athleteUser
    const link = await prisma.coachAthlete.create({
      data: {
        id: crypto.randomUUID(),
        coachId: coachUser.id,
        athleteId: athleteUser.id,
        status: "ACTIVE",
      },
    });
    activeLinkId = link.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /coach/prescriptions — 401 para requisição sem autenticação", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null as any);

    const res = await app.inject({
      method: "POST",
      url: "/coach/prescriptions",
      payload: {
        athleteId: athleteUser.id,
        name: "Hipertrofia A/B",
        workoutDays: validWorkoutDays,
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("POST /coach/prescriptions — 403 se o treinador não possui entitlement ASSIGN_WORKOUTS", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachWithoutEntitlement,
      session: { id: "s-lim", userId: coachWithoutEntitlement.id } as any,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/coach/prescriptions",
      payload: {
        athleteId: athleteUser.id,
        name: "Hipertrofia A/B",
        workoutDays: validWorkoutDays,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe("ASSIGN_WORKOUTS_ENTITLEMENT_REQUIRED");
  });

  it("POST /coach/prescriptions — 404 se tentar prescrever para atleta não vinculado", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/coach/prescriptions",
      payload: {
        athleteId: secondAthlete.id, // Não vinculado
        name: "Hipertrofia A/B",
        workoutDays: validWorkoutDays,
      },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.code).toBe("COACH_ATHLETE_LINK_NOT_FOUND");
  });

  it("POST /coach/prescriptions — cria rascunho com sucesso (status DRAFT)", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: "/coach/prescriptions",
      payload: {
        athleteId: athleteUser.id,
        name: "Plano Inicial de Hipertrofia",
        notes: "Foque na execução e cadência de 2s.",
        workoutDays: validWorkoutDays,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.status).toBe("DRAFT");
    expect(body.name).toBe("Plano Inicial de Hipertrofia");
    expect(body.notes).toBe("Foque na execução e cadência de 2s.");
    expect(body.payload.workoutDays).toHaveLength(2);
    expect(body.payload.workoutDays[0].exercises).toHaveLength(2);
    expect(body.payload.workoutDays[0].exercises[0].warmupSets).toBe(1);
  });

  it("PUT /coach/prescriptions/:id — edita rascunho com sucesso", async () => {
    // Primeiro cria um rascunho
    const draft = await prisma.workoutPrescription.create({
      data: {
        coachId: coachUser.id,
        athleteId: athleteUser.id,
        name: "Rascunho Original",
        status: "DRAFT",
        payload: { workoutDays: validWorkoutDays },
      },
    });

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "PUT",
      url: `/coach/prescriptions/${draft.id}`,
      payload: {
        name: "Rascunho Atualizado v2",
        notes: "Adicionado mais descanso",
        workoutDays: validWorkoutDays,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe("Rascunho Atualizado v2");
    expect(body.notes).toBe("Adicionado mais descanso");
  });

  it("POST /coach/prescriptions/:id/send — transiciona de DRAFT para SENT", async () => {
    const draft = await prisma.workoutPrescription.create({
      data: {
        coachId: coachUser.id,
        athleteId: athleteUser.id,
        name: "Prescrição Pronta para Envio",
        status: "DRAFT",
        payload: { workoutDays: validWorkoutDays },
      },
    });

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: `/coach/prescriptions/${draft.id}/send`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("SENT");
    expect(body.sentAt).not.toBeNull();
  });

  it("PUT /coach/prescriptions/:id — bloqueia edição de prescrição já enviada (imutabilidade)", async () => {
    const sent = await prisma.workoutPrescription.create({
      data: {
        coachId: coachUser.id,
        athleteId: athleteUser.id,
        name: "Prescrição Já Enviada",
        status: "SENT",
        sentAt: new Date(),
        payload: { workoutDays: validWorkoutDays },
      },
    });

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "PUT",
      url: `/coach/prescriptions/${sent.id}`,
      payload: {
        name: "Tentativa de alteração silenciosa",
        workoutDays: validWorkoutDays,
      },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.code).toBe("PRESCRIPTION_ALREADY_SENT");
  });

  it("GET /me/prescriptions/:id — 404 se outro atleta tentar acessar prescrição alheia (IDOR)", async () => {
    const sent = await prisma.workoutPrescription.create({
      data: {
        coachId: coachUser.id,
        athleteId: athleteUser.id,
        name: "Prescrição Exclusiva",
        status: "SENT",
        sentAt: new Date(),
        payload: { workoutDays: validWorkoutDays },
      },
    });

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: secondAthlete,
      session: { id: "s-sec", userId: secondAthlete.id } as any,
    } as any);

    const res = await app.inject({
      method: "GET",
      url: `/me/prescriptions/${sent.id}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it("POST /me/prescriptions/:id/accept — atleta aceita prescrição: cria WorkoutPlan inativo e preserva ownership", async () => {
    const sent = await prisma.workoutPrescription.create({
      data: {
        coachId: coachUser.id,
        athleteId: athleteUser.id,
        name: "Planejamento Aceito pelo Aluno",
        status: "SENT",
        sentAt: new Date(),
        payload: { workoutDays: validWorkoutDays },
      },
    });

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: athleteUser,
      session: { id: "s-ath", userId: athleteUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: `/me/prescriptions/${sent.id}/accept`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.workoutPlanId).toBeDefined();
    expect(body.prescription.status).toBe("ACCEPTED");
    expect(body.prescription.acceptedWorkoutPlanId).toBe(body.workoutPlanId);

    // Validação profunda no banco de dados
    const plan = await prisma.workoutPlan.findUnique({
      where: { id: body.workoutPlanId },
      include: {
        workoutDays: {
          include: { exercises: true },
        },
      },
    });

    expect(plan).not.toBeNull();
    // 1. REQUISITO CRÍTICO: userId deve pertencer ao atleta, NÃO ao personal
    expect(plan!.userId).toBe(athleteUser.id);
    // 2. REQUISITO CRÍTICO: isActive deve ser false (não substitui o plano ativo do aluno automaticamente)
    expect(plan!.isActive).toBe(false);
    expect(plan!.name).toBe("Planejamento Aceito pelo Aluno");
    expect(plan!.workoutDays).toHaveLength(2);
    expect(plan!.workoutDays[0].exercises).toHaveLength(2);
  });

  it("POST /me/prescriptions/:id/accept — idempotência em requisições repetidas", async () => {
    const sent = await prisma.workoutPrescription.create({
      data: {
        coachId: coachUser.id,
        athleteId: athleteUser.id,
        name: "Prescrição Teste Idempotência",
        status: "SENT",
        sentAt: new Date(),
        payload: { workoutDays: validWorkoutDays },
      },
    });

    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: athleteUser,
      session: { id: "s-ath", userId: athleteUser.id } as any,
    } as any);

    // Primeiro aceite
    const res1 = await app.inject({
      method: "POST",
      url: `/me/prescriptions/${sent.id}/accept`,
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json();

    // Segundo aceite (repetido)
    const res2 = await app.inject({
      method: "POST",
      url: `/me/prescriptions/${sent.id}/accept`,
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json();

    // Deve retornar o mesmo workoutPlanId sem duplicar no banco
    expect(body2.workoutPlanId).toBe(body1.workoutPlanId);

    const totalPlans = await prisma.workoutPlan.count({
      where: { name: "Prescrição Teste Idempotência", userId: athleteUser.id },
    });
    expect(totalPlans).toBe(1);
  });

  it("POST /me/prescriptions/:id/accept — bloqueia aceite se vínculo Coach-Athlete foi revogado antes", async () => {
    // Revoga temporariamente o vínculo
    await prisma.coachAthlete.update({
      where: { id: activeLinkId },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
      },
    });

    const sent = await prisma.workoutPrescription.create({
      data: {
        coachId: coachUser.id,
        athleteId: athleteUser.id,
        name: "Prescrição com Vínculo Revogado",
        status: "SENT",
        sentAt: new Date(),
        payload: { workoutDays: validWorkoutDays },
      },
    });

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: athleteUser,
      session: { id: "s-ath", userId: athleteUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: `/me/prescriptions/${sent.id}/accept`,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe("COACH_ATHLETE_LINK_REVOKED");

    // Restaura vínculo ativo para os demais testes
    await prisma.coachAthlete.update({
      where: { id: activeLinkId },
      data: {
        status: "ACTIVE",
        revokedAt: null,
      },
    });
  });

  it("POST /me/prescriptions/:id/decline — atleta recusa prescrição", async () => {
    const sent = await prisma.workoutPrescription.create({
      data: {
        coachId: coachUser.id,
        athleteId: athleteUser.id,
        name: "Prescrição Recusada",
        status: "SENT",
        sentAt: new Date(),
        payload: { workoutDays: validWorkoutDays },
      },
    });

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: athleteUser,
      session: { id: "s-ath", userId: athleteUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: `/me/prescriptions/${sent.id}/decline`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("DECLINED");
    expect(body.respondedAt).not.toBeNull();
  });

  it("POST /coach/prescriptions/:id/cancel — treinador cancela prescrição pendente", async () => {
    const sent = await prisma.workoutPrescription.create({
      data: {
        coachId: coachUser.id,
        athleteId: athleteUser.id,
        name: "Prescrição Cancelada pelo Treinador",
        status: "SENT",
        sentAt: new Date(),
        payload: { workoutDays: validWorkoutDays },
      },
    });

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: coachUser,
      session: { id: "s-coach", userId: coachUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: `/coach/prescriptions/${sent.id}/cancel`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("CANCELLED");
  });

  it("Ativação voluntária posterior do plano aceito via ActivateWorkoutPlan", async () => {
    const sent = await prisma.workoutPrescription.create({
      data: {
        coachId: coachUser.id,
        athleteId: athleteUser.id,
        name: "Plano para Ativação Voluntária",
        status: "SENT",
        sentAt: new Date(),
        payload: { workoutDays: validWorkoutDays },
      },
    });

    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: athleteUser,
      session: { id: "s-ath", userId: athleteUser.id } as any,
    } as any);

    const res = await app.inject({
      method: "POST",
      url: `/me/prescriptions/${sent.id}/accept`,
    });
    expect(res.statusCode).toBe(200);
    const { workoutPlanId } = res.json();

    // Plano começa inativo
    const initialPlan = await prisma.workoutPlan.findUnique({
      where: { id: workoutPlanId },
    });
    expect(initialPlan!.isActive).toBe(false);

    // Atleta decide voluntariamente ativar o plano
    const activateUseCase = new ActivateWorkoutPlan();
    const activatedResult = await activateUseCase.execute({
      userId: athleteUser.id,
      workoutPlanId,
    });

    expect(activatedResult.isActive).toBe(true);

    const finalPlan = await prisma.workoutPlan.findUnique({
      where: { id: workoutPlanId },
    });
    expect(finalPlan!.isActive).toBe(true);
  });

  describe("Geração de Rascunho de Prescrição com Coach AI", () => {
    it("POST /coach/prescriptions/ai-generate — 401 para usuário não autenticado", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

      const res = await app.inject({
        method: "POST",
        url: "/coach/prescriptions/ai-generate",
        payload: {
          athleteId: athleteUser.id,
          prompt: "Montar treino ABC",
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("POST /coach/prescriptions/ai-generate — 404 para aluno não vinculado ao treinador", async () => {
      const unlinkedAthlete = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          name: "Atleta Desconhecido",
          email: `unknown-${Date.now()}@test.com`,
          accountType: "ATHLETE",
        },
      });

      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: coachUser,
        session: { id: "s-coach", userId: coachUser.id } as any,
      } as any);

      const res = await app.inject({
        method: "POST",
        url: "/coach/prescriptions/ai-generate",
        payload: {
          athleteId: unlinkedAthlete.id,
          prompt: "Montar treino ABC",
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("ATHLETE_NOT_FOUND");
    });

    it("POST /coach/prescriptions/ai-generate — 200 com estrutura completa gerada para treinador autorizado", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: coachUser,
        session: { id: "s-coach", userId: coachUser.id } as any,
      } as any);

      const res = await app.inject({
        method: "POST",
        url: "/coach/prescriptions/ai-generate",
        payload: {
          athleteId: athleteUser.id,
          prompt: "Montar treino ABC para hipertrofia com foco em superiores",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.name).toBe("string");
      expect(Array.isArray(body.workoutDays)).toBe(true);
      expect(body.workoutDays.length).toBeGreaterThan(0);

      const workoutDay = body.workoutDays[0];
      expect(typeof workoutDay.name).toBe("string");
      expect(typeof workoutDay.weekDay).toBe("string");
      expect(typeof workoutDay.isRest).toBe("boolean");
      expect(Array.isArray(workoutDay.exercises)).toBe(true);

      if (workoutDay.exercises.length > 0) {
        const ex = workoutDay.exercises[0];
        expect(typeof ex.name).toBe("string");
        expect(typeof ex.sets).toBe("number");
        expect(typeof ex.reps).toBe("number");
        expect(typeof ex.restTimeInSeconds).toBe("number");
      }
    });
  });
});

