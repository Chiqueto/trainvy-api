import Fastify, { FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "../../src/lib/auth.js";
import { prisma } from "../../src/lib/db.js";
import { historyRoutes } from "../../src/routes/history.js";
import { workoutSessionRoutes } from "../../src/routes/workout-session.js";
import { workoutSessionRecoveryRoutes } from "../../src/routes/workout-session-recovery.js";
import {
  cleanupTestUsers,
  createTestExercise,
  createTestUser,
  createTestWorkoutPlan,
  createTestWorkoutDay,
} from "../helpers/test-db.js";

describe("Task 6.5B — Forgotten Workout Recovery Routes", () => {
  let app: FastifyInstance;
  const testUserIds: string[] = [];
  let userA: { id: string; email: string; name: string };
  let userB: { id: string; email: string; name: string };
  let globalExercise1: { id: string; name: string };
  let globalExercise2: { id: string; name: string };

  beforeAll(async () => {
    app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(workoutSessionRecoveryRoutes);
    await app.register(workoutSessionRoutes);
    await app.register(historyRoutes, { prefix: "/history" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    userA = await createTestUser();
    userB = await createTestUser();
    testUserIds.push(userA.id, userB.id);

    globalExercise1 = await createTestExercise({
      name: "Supino Reto com Barra (Global Test)",
      ownerUserId: null,
    });
    globalExercise2 = await createTestExercise({
      name: "Tríceps Pulley (Global Test)",
      ownerUserId: null,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestUsers(testUserIds);
    testUserIds.length = 0;
  });

  function mockAuthUser(user: { id: string; email: string; name: string }) {
    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {
        id: "sess-test",
        userId: user.id,
        expiresAt: new Date(Date.now() + 86400000),
        token: "tok-test",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as any);
  }

  describe("1. Criação e Ausência de Gravação Prévia de Sessão", () => {
    it("cria ForgottenWorkoutDraft sem gravar WorkoutSession ou WorkoutSet no banco", async () => {
      mockAuthUser(userA);

      const response = await app.inject({
        method: "POST",
        url: "/workout-sessions/recovery/drafts",
        payload: {
          date: "2026-10-15",
          timezone: "America/Sao_Paulo",
          title: "Treino de Peito e Tríceps Passado",
          exercises: [
            {
              order: 1,
              exerciseId: globalExercise1.id,
              sets: [
                { order: 1, type: "WARMUP", weightKg: 20, reps: 15 },
                { order: 2, type: "WORKING", weightKg: 60, reps: 10, rir: 2 },
              ],
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const draft = JSON.parse(response.payload);
      expect(draft.id).toBeDefined();
      expect(draft.status).toBe("DRAFT");
      expect(draft.revision).toBe(1);
      expect(draft.timePrecision).toBe("DATE_ONLY");
      expect(draft.startedAt).toBeNull();
      expect(draft.completedAt).toBeNull();
      expect(draft.sessionDate).toBe("2026-10-15");

      // Invariante: nenhuma WorkoutSession ou WorkoutSet deve existir antes da confirmação
      const sessionsCount = await prisma.workoutSession.count({
        where: { athleteId: userA.id },
      });
      expect(sessionsCount).toBe(0);

      const setsCount = await prisma.workoutSet.count({
        where: { sessionExercise: { workoutSession: { athleteId: userA.id } } },
      });
      expect(setsCount).toBe(0);
    });

    it("rejeita datas no futuro deterministamente (403)", async () => {
      mockAuthUser(userA);

      const response = await app.inject({
        method: "POST",
        url: "/workout-sessions/recovery/drafts",
        payload: {
          date: "2099-01-01",
          timezone: "America/Sao_Paulo",
          title: "Treino do Futuro",
          exercises: [
            {
              order: 1,
              exerciseId: globalExercise1.id,
              sets: [{ order: 1, type: "WORKING", weightKg: 50, reps: 10 }],
            },
          ],
        },
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload).error).toMatch(/futuro/i);
    });

    it("rejeita timezone IANA inválido ou offset bruto (400)", async () => {
      mockAuthUser(userA);

      const response = await app.inject({
        method: "POST",
        url: "/workout-sessions/recovery/drafts",
        payload: {
          date: "2026-10-15",
          timezone: "-03:00", // offset fixo bruto não permitido
          title: "Treino Teste",
          exercises: [
            {
              order: 1,
              exerciseId: globalExercise1.id,
              sets: [{ order: 1, type: "WORKING", weightKg: 50, reps: 10 }],
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejeita exercício pertencente exclusivamente a outro usuário (404)", async () => {
      const privateExerciseUserB = await createTestExercise({
        name: "Exercício Secreto B",
        ownerUserId: userB.id,
      });

      mockAuthUser(userA);

      const response = await app.inject({
        method: "POST",
        url: "/workout-sessions/recovery/drafts",
        payload: {
          date: "2026-10-15",
          timezone: "America/Sao_Paulo",
          title: "Tentativa de IDOR com Exercício de Outro Atleta",
          exercises: [
            {
              order: 1,
              exerciseId: privateExerciseUserB.id,
              sets: [{ order: 1, type: "WORKING", weightKg: 50, reps: 10 }],
            },
          ],
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("2. Edição, Revisão Otimista e Descarte", () => {
    it("PATCH atualiza rascunho, incrementa revision e bloqueia confirmação com revision desatualizada", async () => {
      mockAuthUser(userA);

      // Cria rascunho (revision 1)
      const createRes = await app.inject({
        method: "POST",
        url: "/workout-sessions/recovery/drafts",
        payload: {
          date: "2026-10-16",
          timezone: "America/Sao_Paulo",
          title: "Treino Inicial",
          exercises: [
            {
              order: 1,
              exerciseId: globalExercise1.id,
              sets: [{ order: 1, type: "WORKING", weightKg: 40, reps: 10 }],
            },
          ],
        },
      });
      const draft = JSON.parse(createRes.payload);
      expect(draft.revision).toBe(1);

      // Edita rascunho -> revision vira 2
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/workout-sessions/recovery/drafts/${draft.id}`,
        payload: {
          clientRevision: 1,
          title: "Treino Atualizado com Carga Maior",
          exercises: [
            {
              order: 1,
              exerciseId: globalExercise1.id,
              sets: [{ order: 1, type: "WORKING", weightKg: 60, reps: 12 }],
            },
          ],
        },
      });
      expect(updateRes.statusCode).toBe(200);
      const updatedDraft = JSON.parse(updateRes.payload);
      expect(updatedDraft.revision).toBe(2);
      expect(updatedDraft.title).toBe("Treino Atualizado com Carga Maior");

      // Tentativa de confirmação com clientRevision: 1 (desatualizada) deve ser rejeitada com 409 Conflict
      const staleConfirmRes = await app.inject({
        method: "POST",
        url: `/workout-sessions/recovery/drafts/${draft.id}/confirm`,
        payload: {
          clientRevision: 1,
        },
      });
      expect(staleConfirmRes.statusCode).toBe(409);
    });

    it("descarte de rascunho impede confirmação posterior (409 Conflict)", async () => {
      mockAuthUser(userA);

      const createRes = await app.inject({
        method: "POST",
        url: "/workout-sessions/recovery/drafts",
        payload: {
          date: "2026-10-14",
          timezone: "America/Sao_Paulo",
          title: "Treino a ser descartado",
          exercises: [
            {
              order: 1,
              exerciseId: globalExercise1.id,
              sets: [{ order: 1, type: "WORKING", weightKg: 30, reps: 10 }],
            },
          ],
        },
      });
      const draft = JSON.parse(createRes.payload);

      // Descarta
      const discardRes = await app.inject({
        method: "POST",
        url: `/workout-sessions/recovery/drafts/${draft.id}/discard`,
        payload: {},
      });
      expect(discardRes.statusCode).toBe(200);
      expect(JSON.parse(discardRes.payload).draft.status).toBe("DISCARDED");

      // Tentativa de confirmação deve falhar
      const confirmRes = await app.inject({
        method: "POST",
        url: `/workout-sessions/recovery/drafts/${draft.id}/confirm`,
        payload: {
          clientRevision: 1,
        },
      });
      expect(confirmRes.statusCode).toBe(409);
    });

    it("bloqueia acesso a rascunho de outro usuário (403)", async () => {
      mockAuthUser(userA);
      const createRes = await app.inject({
        method: "POST",
        url: "/workout-sessions/recovery/drafts",
        payload: {
          date: "2026-10-14",
          timezone: "America/Sao_Paulo",
          title: "Treino Privado de A",
          exercises: [
            {
              order: 1,
              exerciseId: globalExercise1.id,
              sets: [{ order: 1, type: "WORKING", weightKg: 30, reps: 10 }],
            },
          ],
        },
      });
      const draft = JSON.parse(createRes.payload);

      // Usuário B tenta ler o rascunho de A
      mockAuthUser(userB);
      const getRes = await app.inject({
        method: "GET",
        url: `/workout-sessions/recovery/drafts/${draft.id}`,
      });
      expect(getRes.statusCode).toBe(403);
    });
  });

  describe("3. Confirmação Atômica, Idempotência e Histórico", () => {
    it("confirma rascunho com sucesso, grava sessão retroativa e responde com idempotência a chamadas repetidas", async () => {
      mockAuthUser(userA);

      const createRes = await app.inject({
        method: "POST",
        url: "/workout-sessions/recovery/drafts",
        payload: {
          date: "2026-10-10",
          timezone: "America/Sao_Paulo",
          title: "Supino e Tríceps Retroativo",
          exercises: [
            {
              order: 1,
              exerciseId: globalExercise1.id,
              sets: [
                { order: 1, type: "WARMUP", weightKg: 20, reps: 15 },
                { order: 2, type: "WORKING", weightKg: 80, reps: 8, rir: 2 },
              ],
            },
            {
              order: 2,
              exerciseId: globalExercise2.id,
              sets: [
                { order: 1, type: "WORKING", weightKg: 30, reps: 12, rir: 1 },
              ],
            },
          ],
        },
      });
      const draft = JSON.parse(createRes.payload);

      // 1ª Confirmação
      const confirmRes = await app.inject({
        method: "POST",
        url: `/workout-sessions/recovery/drafts/${draft.id}/confirm`,
        payload: {
          clientRevision: 1,
        },
      });

      expect(confirmRes.statusCode).toBe(200);
      const confirmData = JSON.parse(confirmRes.payload);
      expect(confirmData.success).toBe(true);
      expect(confirmData.sessionId).toBeDefined();

      const createdSession = await prisma.workoutSession.findUnique({
        where: { id: confirmData.sessionId },
        include: {
          sessionExercises: {
            include: { sets: true },
          },
        },
      });

      expect(createdSession).toBeTruthy();
      expect(createdSession!.isRetroactive).toBe(true);
      expect(createdSession!.timePrecision).toBe("DATE_ONLY");
      expect(createdSession!.recoveryDraftId).toBe(draft.id);
      expect(createdSession!.sessionDate?.toISOString().split("T")[0]).toBe("2026-10-10");
      expect(createdSession!.sessionExercises).toHaveLength(2);

      // As séries devem ter completedAt preenchido para integrar volume e histórico
      const allSets = createdSession!.sessionExercises.flatMap((se) => se.sets);
      expect(allSets).toHaveLength(3);
      for (const set of allSets) {
        expect(set.completedAt).toBeTruthy();
      }

      // 2ª Confirmação (Idempotência / Retry)
      const retryRes = await app.inject({
        method: "POST",
        url: `/workout-sessions/recovery/drafts/${draft.id}/confirm`,
        payload: {
          clientRevision: 1,
        },
      });

      expect(retryRes.statusCode).toBe(200);
      expect(JSON.parse(retryRes.payload).sessionId).toBe(confirmData.sessionId);

      // Não duplicou sessões
      const count = await prisma.workoutSession.count({
        where: { athleteId: userA.id },
      });
      expect(count).toBe(1);

      // 3. Verificação no endpoint de Histórico (GET /history/sessions)
      const historyRes = await app.inject({
        method: "GET",
        url: "/history/sessions",
      });
      expect(historyRes.statusCode).toBe(200);
      const historyData = JSON.parse(historyRes.payload);
      expect(historyData.items).toHaveLength(1);

      const historyItem = historyData.items[0];
      expect(historyItem.id).toBe(confirmData.sessionId);
      expect(historyItem.isRetroactive).toBe(true);
      expect(historyItem.timePrecision).toBe("DATE_ONLY");
      expect(historyItem.durationInSeconds).toBeNull(); // Sem duração fictícia inventada!
      expect(historyItem.totalLoadVolumeKg).toBeGreaterThan(0); // Volume calculado das working sets!
    });
  });

  describe("4. Detecção de Conflitos e Dois Treinos no Mesmo Dia", () => {
    it("detecta sessão já existente no mesmo dia e exige confirmConflict: true para criar o segundo treino", async () => {
      mockAuthUser(userA);

      // 1. Cria uma primeira sessão retroativa confirmada para 2026-10-12
      const firstDraftRes = await app.inject({
        method: "POST",
        url: "/workout-sessions/recovery/drafts",
        payload: {
          date: "2026-10-12",
          timezone: "America/Sao_Paulo",
          title: "Treino Manhã",
          exercises: [
            {
              order: 1,
              exerciseId: globalExercise1.id,
              sets: [{ order: 1, type: "WORKING", weightKg: 50, reps: 10 }],
            },
          ],
        },
      });
      const firstDraft = JSON.parse(firstDraftRes.payload);

      await app.inject({
        method: "POST",
        url: `/workout-sessions/recovery/drafts/${firstDraft.id}/confirm`,
        payload: { clientRevision: 1 },
      });

      // 2. Cria um segundo rascunho para a mesma data (2026-10-12)
      const secondDraftRes = await app.inject({
        method: "POST",
        url: "/workout-sessions/recovery/drafts",
        payload: {
          date: "2026-10-12",
          timezone: "America/Sao_Paulo",
          title: "Treino Noite (Segundo do Dia)",
          exercises: [
            {
              order: 1,
              exerciseId: globalExercise2.id,
              sets: [{ order: 1, type: "WORKING", weightKg: 25, reps: 15 }],
            },
          ],
        },
      });
      const secondDraft = JSON.parse(secondDraftRes.payload);

      // GET do rascunho deve sinalizar conflito
      const getRes = await app.inject({
        method: "GET",
        url: `/workout-sessions/recovery/drafts/${secondDraft.id}`,
      });
      expect(getRes.statusCode).toBe(200);
      const details = JSON.parse(getRes.payload);
      expect(details.conflicts.hasConflict).toBe(true);
      expect(details.conflicts.conflictingSessions).toHaveLength(1);

      // Tentativa de confirmação sem confirmConflict: true deve ser bloqueada (409 POTENTIAL_CONFLICT_DETECTED)
      const blockConfirmRes = await app.inject({
        method: "POST",
        url: `/workout-sessions/recovery/drafts/${secondDraft.id}/confirm`,
        payload: {
          clientRevision: 1,
          confirmConflict: false,
        },
      });
      expect(blockConfirmRes.statusCode).toBe(409);
      expect(JSON.parse(blockConfirmRes.payload).code).toBe("POTENTIAL_CONFLICT_DETECTED");

      // Confirmação com confirmConflict: true permite o segundo treino legítimo
      const allowConfirmRes = await app.inject({
        method: "POST",
        url: `/workout-sessions/recovery/drafts/${secondDraft.id}/confirm`,
        payload: {
          clientRevision: 1,
          confirmConflict: true,
        },
      });
      expect(allowConfirmRes.statusCode).toBe(200);

      const totalSessions = await prisma.workoutSession.count({
        where: { athleteId: userA.id },
      });
      expect(totalSessions).toBe(2);
    });
  });
});
