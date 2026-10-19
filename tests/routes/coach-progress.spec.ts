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
import { coachProgressRoutes } from "../../src/routes/coach-progress.js";
import { historyRoutes } from "../../src/routes/history.js";

describe("Coach Athlete Progress & Training History (Task 6.3)", () => {
  let app: FastifyInstance;
  let coachA: { id: string; email: string; name: string };
  let coachB: { id: string; email: string; name: string };
  let coachNoPlan: { id: string; email: string; name: string };
  let athleteUser: { id: string; email: string; name: string };
  let otherAthleteUser: { id: string; email: string; name: string };

  let activeLinkA: { id: string };
  let canonicalExercise: { id: string; name: string };
  let oldSessionId: string;
  let recentSessionId: string;
  let consentGrantedDate: Date;

  beforeAll(async () => {
    app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(coachRoutes);
    await app.register(coachProgressRoutes);
    await app.register(historyRoutes, { prefix: "/history" });
    await app.ready();

    // 1. Cria plano comercial com entitlement MANAGE_ATHLETES
    const plan = await prisma.plan.create({
      data: {
        code: `PROG_COACH_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: "Progress Coach Plan",
        audience: "COACH",
        monthlyPriceInCents: 9990,
        currency: "BRL",
        isActive: true,
        isPublic: true,
        entitlements: {
          create: [
            { entitlement: "COACH_DASHBOARD", limitValue: null },
            { entitlement: "MANAGE_ATHLETES", limitValue: 10 },
          ],
        },
      },
    });

    // 2. Treinador A (com plano ativo)
    coachA = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Treinador Alpha",
        email: `coach-alpha-${Date.now()}@trainvy.test`,
        accountType: "COACH",
        accountSetupCompletedAt: new Date(),
      },
    });

    await prisma.subscription.create({
      data: {
        userId: coachA.id,
        planId: plan.id,
        status: "ACTIVE",
        priceInCentsSnapshot: 9990,
        currencySnapshot: "BRL",
        currentPeriodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // 3. Treinador B (com plano ativo, para testes de IDOR)
    coachB = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Treinador Beta",
        email: `coach-beta-${Date.now()}@trainvy.test`,
        accountType: "COACH",
        accountSetupCompletedAt: new Date(),
      },
    });

    await prisma.subscription.create({
      data: {
        userId: coachB.id,
        planId: plan.id,
        status: "ACTIVE",
        priceInCentsSnapshot: 9990,
        currencySnapshot: "BRL",
        currentPeriodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // 4. Treinador sem entitlement MANAGE_ATHLETES
    coachNoPlan = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Treinador Sem Plano",
        email: `coach-noplan-${Date.now()}@trainvy.test`,
        accountType: "COACH",
        accountSetupCompletedAt: new Date(),
      },
    });

    // 5. Atletas
    athleteUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Atleta Principal",
        email: `atleta-${Date.now()}@trainvy.test`,
        accountType: "ATHLETE",
        accountSetupCompletedAt: new Date(),
        weightInGrams: 75000,
        heightInCentimeters: 180,
        bodyFatPercentage: 15,
      },
    });

    otherAthleteUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Outro Atleta",
        email: `outro-atleta-${Date.now()}@trainvy.test`,
        accountType: "ATHLETE",
        accountSetupCompletedAt: new Date(),
      },
    });

    // Vínculo Coach A <-> Athlete
    activeLinkA = await prisma.coachAthlete.create({
      data: {
        coachId: coachA.id,
        athleteId: athleteUser.id,
        status: "ACTIVE",
        evolutionShared: false,
        includePreviousHistory: false,
      },
    });

    // Vínculo Coach B <-> Other Athlete
    await prisma.coachAthlete.create({
      data: {
        coachId: coachB.id,
        athleteId: otherAthleteUser.id,
        status: "ACTIVE",
        evolutionShared: true,
        includePreviousHistory: true,
      },
    });

    // 6. Exercício canônico com classificação muscular
    canonicalExercise = await prisma.exercise.create({
      data: {
        name: `Supino Reto Test ${Date.now()}`,
        muscles: {
          create: [
            { muscleGroup: "CHEST", role: "PRIMARY" },
            { muscleGroup: "TRICEPS", role: "SECONDARY" },
          ],
        },
      },
    });

    // 7. Dados de treinos do Atleta Principal:
    // Treino antigo (realizado há 10 dias)
    const oldSession = await prisma.workoutSession.create({
      data: {
        athleteId: athleteUser.id,
        origin: "PLANNED",
        workoutPlanNameSnapshot: "Plano Antigo",
        workoutDayNameSnapshot: "Treino A",
        startedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        completedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + 3600 * 1000),
        sessionExercises: {
          create: {
            exerciseId: canonicalExercise.id,
            exerciseNameSnapshot: canonicalExercise.name,
            order: 1,
            sets: {
              create: [
                {
                  order: 1,
                  type: "WARMUP",
                  weightInGrams: 40000,
                  reps: 15,
                  completedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + 600 * 1000),
                },
                {
                  order: 2,
                  type: "WORKING",
                  weightInGrams: 100000, // PR Antigo: 100kg
                  reps: 10,
                  rir: 2,
                  completedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + 1200 * 1000),
                },
              ],
            },
          },
        },
      },
    });
    oldSessionId = oldSession.id;

    // Treino recente (realizado há 1 dia)
    const recentSession = await prisma.workoutSession.create({
      data: {
        athleteId: athleteUser.id,
        origin: "FREE",
        startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + 3000 * 1000),
        sessionExercises: {
          create: {
            exerciseId: canonicalExercise.id,
            exerciseNameSnapshot: canonicalExercise.name,
            order: 1,
            sets: {
              create: [
                {
                  order: 1,
                  type: "WORKING",
                  weightInGrams: 80000, // Carga recente: 80kg
                  reps: 8,
                  rir: 1,
                  completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 + 1000 * 1000),
                },
              ],
            },
          },
        },
      },
    });
    recentSessionId = recentSession.id;

    // Treino não concluído (incompleto)
    await prisma.workoutSession.create({
      data: {
        athleteId: athleteUser.id,
        origin: "FREE",
        startedAt: new Date(),
        completedAt: null, // NÃO concluído
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  let currentUser: { id: string; email: string; name: string } | null = null;

  beforeEach(() => {
    vi.spyOn(auth.api, "getSession").mockImplementation(async () => {
      if (!currentUser) return null as any;
      return {
        user: {
          id: currentUser.id,
          email: currentUser.email,
          name: currentUser.name,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        session: {
          id: crypto.randomUUID(),
          userId: currentUser.id,
          token: "token",
          expiresAt: new Date(Date.now() + 3600000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      } as any;
    });
  });

  function setUser(user: { id: string; email: string; name: string } | null) {
    currentUser = user;
  }

  // ==========================================
  // PARTE A: CONSENTIMENTO E PRIVACIDADE
  // ==========================================

  it("1. Compartilhamento começa desativado por padrão", async () => {
    setUser(athleteUser);

    const res = await app.inject({
      method: "GET",
      url: "/me/coach-progress-sharing",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hasActiveCoach).toBe(true);
    expect(body.coach.id).toBe(coachA.id);
    expect(body.sharingConsent).toEqual({
      enabled: false,
      includePreviousHistory: false,
      sharedAt: null,
      revokedAt: null,
    });
  });

  it("2 & 3. Personal não consegue conceder acesso a si próprio e apenas atleta pode autorizar", async () => {
    setUser(coachA);

    // Coach tenta invocar o endpoint do atleta para alterar permissão
    const res = await app.inject({
      method: "PATCH",
      url: "/me/coach-progress-sharing",
      payload: { enabled: true, includePreviousHistory: false },
    });

    // Como coachA não tem um coach ativo vinculado a ele, falha com 404 (NO_ACTIVE_COACH)
    expect(res.statusCode).toBe(404);
  });

  it("4. Quando consentimento estiver desativado, o Personal recebe 403 SHARING_NOT_AUTHORIZED", async () => {
    setUser(coachA);

    const res = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/overview?tz=America/Sao_Paulo&weeksCount=4`,
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe("SHARING_NOT_AUTHORIZED");
    expect(body.error).toContain("não autorizou");
  });

  it("5. Atleta ativa autorização e Personal consegue consultar visão geral", async () => {
    setUser(athleteUser);

    // Atleta ativa autorização com data de corte recente (apenas após 5 dias atrás)
    consentGrantedDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    // Atualiza consentimento no banco com evolutionSharedAt de 5 dias atrás
    await prisma.coachAthlete.update({
      where: { id: activeLinkA.id },
      data: {
        evolutionShared: true,
        includePreviousHistory: false,
        evolutionSharedAt: consentGrantedDate,
        evolutionRevokedAt: null,
      },
    });

    setUser(coachA);
    const res = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/overview?tz=America/Sao_Paulo&weeksCount=4`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.athlete.id).toBe(athleteUser.id);
    expect(body.athlete.name).toBe(athleteUser.name);
    expect(body.summary).toBeDefined();
    expect(body.summary.totalWorkouts).toBeGreaterThanOrEqual(1);
    expect(body.weekly).toBeDefined();
    expect(body.muscles).toBeDefined();
  });

  it("6. Histórico anterior ao consentimento fica oculto por padrão (includePreviousHistory: false)", async () => {
    setUser(coachA);

    // Consulta sessões
    const resSessions = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/sessions`,
    });

    expect(resSessions.statusCode).toBe(200);
    const sessions = resSessions.json().items;
    const sessionIds = sessions.map((s: any) => s.id);

    // recentSession (de ontem) DEVE estar presente
    expect(sessionIds).toContain(recentSessionId);
    // oldSession (de 10 dias atrás, antes de 5 dias atrás) NÃO DEVE estar presente
    expect(sessionIds).not.toContain(oldSessionId);

    // Consulta direta à sessão antiga retorna 404 para proteger temporalmente
    setUser(coachA);
    const resDetail = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/sessions/${oldSessionId}`,
    });
    expect(resDetail.statusCode).toBe(404);

    // Evolução do exercício: PR de 100kg ocorrido na sessão antiga de 10 dias atrás não deve ser considerado
    setUser(coachA);
    const resEvol = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/exercises/${canonicalExercise.id}`,
    });

    expect(resEvol.statusCode).toBe(200);
    const evol = resEvol.json();
    // O PR dentro do conjunto autorizado deve ser o de 80kg (80000g), não o de 100kg
    expect(evol.loadPR?.weightInGrams).toBe(80000);
    expect(evol.items.length).toBe(1);
    expect(evol.items[0].workoutSessionId).toBe(recentSessionId);
  });

  it("7. Opt-in explícito permite acessar histórico anterior (includePreviousHistory: true)", async () => {
    setUser(athleteUser);

    // Atleta habilita inclusão de histórico anterior via PATCH
    const resPatch = await app.inject({
      method: "PATCH",
      url: "/me/coach-progress-sharing",
      payload: {
        enabled: true,
        includePreviousHistory: true,
      },
    });

    expect(resPatch.statusCode).toBe(200);
    expect(resPatch.json().sharingConsent.includePreviousHistory).toBe(true);

    setUser(coachA);
    const resSessions = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/sessions`,
    });

    expect(resSessions.statusCode).toBe(200);
    const sessionIds = resSessions.json().items.map((s: any) => s.id);
    expect(sessionIds).toContain(recentSessionId);
    expect(sessionIds).toContain(oldSessionId); // Agora a sessão antiga está incluída!

    // PR do exercício agora passa a refletir o recorde histórico de 100kg
    setUser(coachA);
    const resEvol = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/exercises/${canonicalExercise.id}`,
    });

    expect(resEvol.statusCode).toBe(200);
    expect(resEvol.json().loadPR?.weightInGrams).toBe(100000);
    expect(resEvol.json().items.length).toBe(2);
  });

  it("8. Retirada do opt-in oculta novamente os registros antigos", async () => {
    setUser(athleteUser);

    const resPatch = await app.inject({
      method: "PATCH",
      url: "/me/coach-progress-sharing",
      payload: {
        enabled: true,
        includePreviousHistory: false,
      },
    });

    expect(resPatch.statusCode).toBe(200);
    expect(resPatch.json().sharingConsent.includePreviousHistory).toBe(false);

    setUser(coachA);
    const resSessions = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/sessions`,
    });

    expect(resSessions.statusCode).toBe(200);
    const sessionIds = resSessions.json().items.map((s: any) => s.id);
    expect(sessionIds).not.toContain(oldSessionId);
  });

  it("9. Desativar consentimento bloqueia imediatamente novas consultas (403)", async () => {
    setUser(athleteUser);

    const resPatch = await app.inject({
      method: "PATCH",
      url: "/me/coach-progress-sharing",
      payload: {
        enabled: false,
        includePreviousHistory: false,
      },
    });

    expect(resPatch.statusCode).toBe(200);
    expect(resPatch.json().sharingConsent.enabled).toBe(false);

    // Todas as rotas do Coach são imediatamente bloqueadas com 403
    setUser(coachA);
    const resOverview = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/overview?tz=America/Sao_Paulo&weeksCount=4`,
    });
    expect(resOverview.statusCode).toBe(403);
    expect(resOverview.json().code).toBe("SHARING_NOT_AUTHORIZED");

    setUser(coachA);
    const resSessions = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/sessions`,
    });
    expect(resSessions.statusCode).toBe(403);

    setUser(coachA);
    const resDetail = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/sessions/${recentSessionId}`,
    });
    expect(resDetail.statusCode).toBe(403);
  });

  // ==========================================
  // PARTE B: AUTORIZAÇÃO, IDOR E VÍNCULO
  // ==========================================

  it("11. IDOR: Treinador B não acessa dados do atleta de Treinador A (404 ATHLETE_NOT_FOUND)", async () => {
    // Reativa autorização para testar isolamento entre treinadores
    await prisma.coachAthlete.update({
      where: { id: activeLinkA.id },
      data: { evolutionShared: true, includePreviousHistory: true },
    });

    setUser(coachB); // Coach B não tem vínculo com athleteUser

    const res = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/overview?tz=America/Sao_Paulo&weeksCount=4`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("ATHLETE_NOT_FOUND");
  });

  it("12. Usuário comum (ATHLETE) não acessa endpoints de treinador (403)", async () => {
    setUser(athleteUser);

    const res = await app.inject({
      method: "GET",
      url: `/coach/athletes/${otherAthleteUser.id}/progress/overview?tz=America/Sao_Paulo&weeksCount=4`,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("ONLY_COACHES_ALLOWED");
  });

  it("13. Treinador sem entitlement MANAGE_ATHLETES recebe bloqueio (403)", async () => {
    setUser(coachNoPlan);

    const res = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/overview?tz=America/Sao_Paulo&weeksCount=4`,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("MANAGE_ATHLETES_ENTITLEMENT_REQUIRED");
  });

  it("14. Sessão inexistente ou de outro atleta não é retornada (404)", async () => {
    setUser(coachA);

    const res = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/sessions/${crypto.randomUUID()}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it("15. Vínculo revogado bloqueia leitura imediatamente (404 ATHLETE_NOT_FOUND)", async () => {
    // Revoga vínculo
    await prisma.coachAthlete.update({
      where: { id: activeLinkA.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedByUserId: coachA.id,
        evolutionShared: false,
        evolutionRevokedAt: new Date(),
      },
    });

    setUser(coachA);
    const res = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/overview?tz=America/Sao_Paulo&weeksCount=4`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("ATHLETE_NOT_FOUND");
  });

  // ==========================================
  // PARTE C: INTEGRIDADE DE DADOS E PRIVACIDADE
  // ==========================================

  it("16. Dados corporais e conversas privadas nunca aparecem nos payloads da evolução", async () => {
    // Restaura vínculo e autorização para inspecionar payload completo
    await prisma.coachAthlete.update({
      where: { id: activeLinkA.id },
      data: { status: "ACTIVE", evolutionShared: true, includePreviousHistory: true },
    });

    setUser(coachA);
    const resOverview = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/overview?tz=America/Sao_Paulo&weeksCount=4`,
    });

    expect(resOverview.statusCode).toBe(200);
    const bodyStr = JSON.stringify(resOverview.json());

    // NENHUM dado corporal ou privado deve vazar
    expect(bodyStr).not.toContain("75000"); // weightInGrams
    expect(bodyStr).not.toContain("weightInGrams");
    expect(bodyStr).not.toContain("heightInCentimeters");
    expect(bodyStr).not.toContain("bodyFatPercentage");
    expect(bodyStr).not.toContain("aiConversations");
  });

  it("17. Treinos não concluídos (completedAt: null) ficam fora do histórico e dos cálculos", async () => {
    setUser(coachA);

    const res = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/sessions`,
    });

    expect(res.statusCode).toBe(200);
    const sessions = res.json().items;
    for (const session of sessions) {
      expect(session.completedAt).toBeTruthy();
    }
  });

  it("18. Sessão detalhada preserva snapshots históricos e fidelidade de séries e cargas", async () => {
    setUser(coachA);

    const res = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/sessions/${recentSessionId}`,
    });

    expect(res.statusCode).toBe(200);
    const detail = res.json();
    expect(detail.id).toBe(recentSessionId);
    expect(detail.origin).toBe("FREE");
    expect(detail.summary.workingSetsCount).toBe(1);
    expect(detail.exercises[0].exerciseId).toBe(canonicalExercise.id);
    expect(detail.exercises[0].sets[0].weightInGrams).toBe(80000);
    expect(detail.exercises[0].sets[0].reps).toBe(8);
    expect(detail.exercises[0].sets[0].rir).toBe(1);
  });

  it("19. Listagem de exercícios autorizados retorna os exercícios que o atleta realizou", async () => {
    setUser(coachA);

    const res = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/exercises`,
    });

    expect(res.statusCode).toBe(200);
    const exercises = res.json();
    expect(Array.isArray(exercises)).toBe(true);
    expect(exercises.some((e: any) => e.id === canonicalExercise.id)).toBe(true);
  });

  it("20. Endpoints do próprio atleta continuam funcionando normalmente sem regressão", async () => {
    setUser(athleteUser);

    const res = await app.inject({
      method: "GET",
      url: "/history/sessions",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(1);
  });

  it("21. Novo vínculo criado após revogação NÃO herda autorização antiga (começa desativado)", async () => {
    // Cria atleta fresco
    const freshAthlete = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Fresh Athlete",
        email: `fresh-${Date.now()}@test.com`,
        accountType: "ATHLETE",
        accountSetupCompletedAt: new Date(),
      },
    });

    // Vínculo 1: ativado
    const link1 = await prisma.coachAthlete.create({
      data: {
        coachId: coachA.id,
        athleteId: freshAthlete.id,
        status: "ACTIVE",
        evolutionShared: true,
        includePreviousHistory: true,
      },
    });

    // Revoga vínculo 1
    await prisma.coachAthlete.update({
      where: { id: link1.id },
      data: { status: "REVOKED", revokedAt: new Date(), evolutionShared: false },
    });

    // Vínculo 2 (novo relacionamento estabelecido no futuro)
    const link2 = await prisma.coachAthlete.create({
      data: {
        coachId: coachA.id,
        athleteId: freshAthlete.id,
        status: "ACTIVE",
      },
    });

    // Verifica que o novo vínculo começa com evolutionShared = false
    expect(link2.evolutionShared).toBe(false);
    expect(link2.includePreviousHistory).toBe(false);

    // Tentativa do Personal acessar o novo vínculo sem novo consentimento retorna 403
    setUser(coachA);
    const res = await app.inject({
      method: "GET",
      url: `/coach/athletes/${freshAthlete.id}/progress/overview?tz=America/Sao_Paulo&weeksCount=4`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("SHARING_NOT_AUTHORIZED");
  });

  it("22. Exercício customizado exclusivo de terceiro retorna 404", async () => {
    const thirdPartyUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Third Party",
        email: `third-${Date.now()}@test.com`,
        accountType: "ATHLETE",
      },
    });

    const privateCustomExercise = await prisma.exercise.create({
      data: {
        name: `Privado de Terceiro ${Date.now()}`,
        ownerUserId: thirdPartyUser.id,
      },
    });

    setUser(coachA);
    const res = await app.inject({
      method: "GET",
      url: `/coach/athletes/${athleteUser.id}/progress/exercises/${privateCustomExercise.id}`,
    });

    expect(res.statusCode).toBe(404);
  });
});
