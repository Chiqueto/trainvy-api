import { afterEach, describe, expect, it } from "vitest";

import {
  IdempotencyConflictError,
  NotFoundError,
  ProposalAlreadyProcessedError,
  ProposalExpiredError,
  ProposalOutdatedError,
  ValidationError,
  WorkoutSessionAlreadyCompletedError,
} from "../../src/errors/index.js";
import { SetType, WorkoutSessionOrigin } from "../../src/generated/prisma/enums.js";
import { prisma } from "../../src/lib/db.js";
import { CompleteWorkoutSession } from "../../src/usecases/CompleteWorkoutSession.js";
import { ConfirmWorkoutSetProposal } from "../../src/usecases/ConfirmWorkoutSetProposal.js";
import { CreateWorkoutSet } from "../../src/usecases/CreateWorkoutSet.js";
import { DiscardWorkoutSetProposal } from "../../src/usecases/DiscardWorkoutSetProposal.js";
import { GetExerciseEvolution } from "../../src/usecases/GetExerciseEvolution.js";
import { GetSessionAiContext } from "../../src/usecases/GetSessionAiContext.js";
import { GetUserAiConsent } from "../../src/usecases/GetUserAiConsent.js";
import { ListWorkoutSetProposals } from "../../src/usecases/ListWorkoutSetProposals.js";
import { ProposeSessionSets } from "../../src/usecases/ProposeSessionSets.js";
import { SubstituteSessionExercise } from "../../src/usecases/SubstituteSessionExercise.js";
import { UpdateUserAiConsent } from "../../src/usecases/UpdateUserAiConsent.js";
import {
  cleanupTestUsers,
  createTestExercise,
  createTestUser,
  createTestWorkoutDay,
  createTestWorkoutPlan,
  createTestWorkoutSession,
} from "../helpers/test-db.js";

describe("WorkoutSessionAiAssistant (Task 6.5A Concurrency, Security & Integrity)", () => {
  const createdUserIds: string[] = [];

  const proposeSessionSets = new ProposeSessionSets();
  const confirmProposal = new ConfirmWorkoutSetProposal();
  const discardProposal = new DiscardWorkoutSetProposal();
  const listProposals = new ListWorkoutSetProposals();
  const substituteExercise = new SubstituteSessionExercise();
  const completeSession = new CompleteWorkoutSession();
  const createWorkoutSet = new CreateWorkoutSet();
  const getSessionAiContext = new GetSessionAiContext();
  const getUserAiConsent = new GetUserAiConsent();
  const updateUserAiConsent = new UpdateUserAiConsent();
  const getExerciseEvolution = new GetExerciseEvolution();

  afterEach(async () => {
    await cleanupTestUsers(createdUserIds);
    createdUserIds.length = 0;
  });

  async function createSessionFixture(athleteName = "Atleta AI Teste") {
    const user = await createTestUser({ name: athleteName });
    createdUserIds.push(user.id);

    const exerciseA = await createTestExercise("Supino Reto com Barra");
    const exerciseB = await createTestExercise("Supino Inclinado com Halteres");

    const plan = await createTestWorkoutPlan(user.id, { name: "Plano Força" });
    const day = await createTestWorkoutDay(plan.id, { name: "Treino A" });

    const session = await createTestWorkoutSession(day.id, {
      athleteId: user.id,
      origin: WorkoutSessionOrigin.PLANNED,
    });

    const sessionExercise = await prisma.sessionExercise.create({
      data: {
        workoutSessionId: session.id,
        exerciseId: exerciseA.id,
        exerciseNameSnapshot: exerciseA.name,
        order: 1,
        revision: 1,
      },
    });

    return { user, exerciseA, exerciseB, session, sessionExercise };
  }

  it("1. Nenhum WorkoutSet é criado antes da confirmação explícita", async () => {
    const { user, session, sessionExercise, exerciseA } = await createSessionFixture();

    const proposal = await proposeSessionSets.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      sets: [
        { type: "WORKING", weightKg: 80, reps: 10, rir: 2 },
        { type: "WORKING", weightKg: 80, reps: 8, rir: 1 },
      ],
    });

    expect(proposal.id).toBeDefined();
    expect(proposal.status).toBe("PENDING");
    expect(proposal.targetExerciseNameSnapshot).toBe(exerciseA.name);
    expect(proposal.suggestedSets.length).toBe(2);

    // Verifica que nenhum WorkoutSet foi criado no banco
    const setsCount = await prisma.workoutSet.count({
      where: { sessionExerciseId: sessionExercise.id },
    });
    expect(setsCount).toBe(0);
  });

  it("2. Autorização e isolamento rigoroso (IDOR - 404/NotFoundError para terceiros)", async () => {
    const { session, sessionExercise } = await createSessionFixture("Atleta Proprietario");
    const attacker = await createTestUser({ name: "Atacante Terceiro" });
    createdUserIds.push(attacker.id);

    // Tentativa de propor em sessão alheia
    await expect(
      proposeSessionSets.execute({
        userId: attacker.id,
        sessionId: session.id,
        sessionExerciseId: sessionExercise.id,
        sets: [{ type: "WORKING", weightKg: 60, reps: 10 }],
      }),
    ).rejects.toThrow(NotFoundError);

    // Criando proposta legítima do proprietário
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: session.athleteId },
    });
    const proposal = await proposeSessionSets.execute({
      userId: owner.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      sets: [{ type: "WORKING", weightKg: 80, reps: 10 }],
    });

    // Atacante tenta listar propostas
    await expect(
      listProposals.execute({
        userId: attacker.id,
        sessionId: session.id,
      }),
    ).rejects.toThrow(NotFoundError);

    // Atacante tenta confirmar proposta
    await expect(
      confirmProposal.execute({
        userId: attacker.id,
        sessionId: session.id,
        proposalId: proposal.id,
        sets: [{ type: "WORKING", weightKg: 80, reps: 10 }],
      }),
    ).rejects.toThrow(NotFoundError);

    // Atacante tenta descartar proposta
    await expect(
      discardProposal.execute({
        userId: attacker.id,
        sessionId: session.id,
        proposalId: proposal.id,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("3. Detecta proposta desatualizada por revisão (inclusive troca A -> B -> A) e persiste INVALIDATED", async () => {
    const { user, session, sessionExercise, exerciseA, exerciseB } =
      await createSessionFixture();

    // Gera proposta na revisão 1 (exercício A)
    const proposal = await proposeSessionSets.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      sets: [{ type: "WORKING", weightKg: 80, reps: 10 }],
    });
    expect(proposal.targetSessionExerciseRevision).toBe(1);

    // Troca A -> B (revision vai para 2)
    await substituteExercise.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      newExerciseId: exerciseB.id,
    });

    // Troca B -> A novamente (revision vai para 3, mesmo exercício do targetExerciseId original)
    await substituteExercise.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      newExerciseId: exerciseA.id,
    });

    const refreshedSE = await prisma.sessionExercise.findUniqueOrThrow({
      where: { id: sessionExercise.id },
    });
    expect(refreshedSE.exerciseId).toBe(exerciseA.id);
    expect(refreshedSE.revision).toBe(3);

    // Tentativa de confirmação deve falhar com ProposalOutdatedError
    await expect(
      confirmProposal.execute({
        userId: user.id,
        sessionId: session.id,
        proposalId: proposal.id,
        sets: [{ type: "WORKING", weightKg: 80, reps: 10 }],
      }),
    ).rejects.toThrow(ProposalOutdatedError);

    // Valida que a invalidação foi persistida no banco mesmo com o erro lançado
    const persistedProposal = await prisma.workoutSetProposal.findUniqueOrThrow({
      where: { id: proposal.id },
    });
    expect(persistedProposal.status).toBe("INVALIDATED");
    expect(persistedProposal.invalidationReason).toBe("CONTEXT_REVISION_MISMATCH");

    // Nenhum set criado
    const setsCount = await prisma.workoutSet.count({
      where: { sessionExerciseId: sessionExercise.id },
    });
    expect(setsCount).toBe(0);
  });

  it("4. Idempotência durável, retries idênticos e detecção de payload divergente", async () => {
    const { user, session, sessionExercise } = await createSessionFixture();

    const proposal = await proposeSessionSets.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      sets: [
        { type: "WORKING", weightKg: 70, reps: 12, rir: 2 },
        { type: "WORKING", weightKg: 70, reps: 10, rir: 1 },
      ],
    });

    // Primeira confirmação com idempotencyKey
    const firstResult = await confirmProposal.execute({
      userId: user.id,
      sessionId: session.id,
      proposalId: proposal.id,
      idempotencyKey: "client-req-001",
      sets: [
        { type: "WORKING", weightKg: 72.5, reps: 12, rir: 2 },
        { type: "WORKING", weightKg: 72.5, reps: 10, rir: 1 },
      ],
    });

    expect(firstResult.success).toBe(true);
    expect(firstResult.createdSets.length).toBe(2);
    expect(firstResult.createdSets[0].weightInGrams).toBe(72500);

    // Retry com a MESMA chave e MESMO payload (simula duplo clique ou retry de rede)
    const retryResult = await confirmProposal.execute({
      userId: user.id,
      sessionId: session.id,
      proposalId: proposal.id,
      idempotencyKey: "client-req-001",
      sets: [
        { type: "WORKING", weightKg: 72.5, reps: 12, rir: 2 },
        { type: "WORKING", weightKg: 72.5, reps: 10, rir: 1 },
      ],
    });

    expect(retryResult.success).toBe(true);
    expect(retryResult.createdSets.length).toBe(2);
    expect(retryResult.createdSets[0].id).toBe(firstResult.createdSets[0].id);

    // Confirma que não duplicou no banco
    const totalSetsInDb = await prisma.workoutSet.count({
      where: { sessionExerciseId: sessionExercise.id },
    });
    expect(totalSetsInDb).toBe(2);

    // Tentativa de confirmação com payload divergente (mesmo proposalId, dados diferentes)
    await expect(
      confirmProposal.execute({
        userId: user.id,
        sessionId: session.id,
        proposalId: proposal.id,
        idempotencyKey: "client-req-002",
        sets: [{ type: "WORKING", weightKg: 100, reps: 5, rir: 0 }],
      }),
    ).rejects.toThrow(IdempotencyConflictError);

    // Cargas no banco permanecem inalteradas
    const setsAfterConflict = await prisma.workoutSet.findMany({
      where: { sessionExerciseId: sessionExercise.id },
      orderBy: { order: "asc" },
    });
    expect(setsAfterConflict[0].weightInGrams).toBe(72500);
  });

  it("5. Confirmação vs Descarte, Encerramento e Registro Manual", async () => {
    const { user, session, sessionExercise } = await createSessionFixture();

    // 5A: Descarte prévio impede confirmação subsequente
    const proposalToDiscard = await proposeSessionSets.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      sets: [{ type: "WORKING", weightKg: 50, reps: 10 }],
    });

    const discardRes = await discardProposal.execute({
      userId: user.id,
      sessionId: session.id,
      proposalId: proposalToDiscard.id,
      reason: "Prefiro fazer outro exercício",
    });
    expect(discardRes.success).toBe(true);
    expect(discardRes.proposal.status).toBe("DISCARDED");

    await expect(
      confirmProposal.execute({
        userId: user.id,
        sessionId: session.id,
        proposalId: proposalToDiscard.id,
        sets: [{ type: "WORKING", weightKg: 50, reps: 10 }],
      }),
    ).rejects.toThrow(ProposalAlreadyProcessedError);

    // 5B: Registro manual de série incrementa revisão e invalida propostas pendentes
    const proposalBeforeManual = await proposeSessionSets.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      sets: [{ type: "WORKING", weightKg: 55, reps: 10 }],
    });
    expect(proposalBeforeManual.targetSessionExerciseRevision).toBe(1);

    // Atleta registra uma série manualmente na interface
    await createWorkoutSet.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      type: SetType.WORKING,
      weightInGrams: 55000,
      reps: 10,
    });

    const seAfterManual = await prisma.sessionExercise.findUniqueOrThrow({
      where: { id: sessionExercise.id },
    });
    expect(seAfterManual.revision).toBe(2);

    await expect(
      confirmProposal.execute({
        userId: user.id,
        sessionId: session.id,
        proposalId: proposalBeforeManual.id,
        sets: [{ type: "WORKING", weightKg: 55, reps: 10 }],
      }),
    ).rejects.toThrow(ProposalOutdatedError);

    // 5C: Sessão encerrada impede confirmação
    const proposalBeforeComplete = await proposeSessionSets.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      sets: [{ type: "WORKING", weightKg: 60, reps: 10 }],
    });

    // Marca sets pendentes como concluídos para permitir o encerramento da sessão
    await prisma.workoutSet.updateMany({
      where: { sessionExerciseId: sessionExercise.id },
      data: { completedAt: new Date() },
    });

    // Encerra sessão
    await completeSession.execute({
      userId: user.id,
      sessionId: session.id,
    });

    await expect(
      confirmProposal.execute({
        userId: user.id,
        sessionId: session.id,
        proposalId: proposalBeforeComplete.id,
        sets: [{ type: "WORKING", weightKg: 60, reps: 10 }],
      }),
    ).rejects.toThrow(ProposalOutdatedError);
  });

  it("6. Expiração, conversão determinística e validação de valores editados", async () => {
    const { user, session, sessionExercise } = await createSessionFixture();

    // 6A: Expiração da proposta
    const expiredProposal = await proposeSessionSets.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      sets: [{ type: "WORKING", weightKg: 60, reps: 10 }],
    });

    // Força data de expiração no passado no banco
    await prisma.workoutSetProposal.update({
      where: { id: expiredProposal.id },
      data: { expiresAt: new Date(Date.now() - 5000) },
    });

    await expect(
      confirmProposal.execute({
        userId: user.id,
        sessionId: session.id,
        proposalId: expiredProposal.id,
        sets: [{ type: "WORKING", weightKg: 60, reps: 10 }],
      }),
    ).rejects.toThrow(ProposalExpiredError);

    const checkExpired = await prisma.workoutSetProposal.findUniqueOrThrow({
      where: { id: expiredProposal.id },
    });
    expect(checkExpired.status).toBe("INVALIDATED");
    expect(checkExpired.invalidationReason).toBe("EXPIRED");

    // 6B: Validação estrita de limites
    const proposal = await proposeSessionSets.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      sets: [{ type: "WORKING", weightKg: 50, reps: 10 }],
    });

    // Peso negativo
    await expect(
      confirmProposal.execute({
        userId: user.id,
        sessionId: session.id,
        proposalId: proposal.id,
        sets: [{ type: "WORKING", weightKg: -5, reps: 10 }],
      }),
    ).rejects.toThrow(ValidationError);

    // Peso excessivo (>1000kg)
    await expect(
      confirmProposal.execute({
        userId: user.id,
        sessionId: session.id,
        proposalId: proposal.id,
        sets: [{ type: "WORKING", weightKg: 1500, reps: 10 }],
      }),
    ).rejects.toThrow(ValidationError);

    // Reps negativas
    await expect(
      confirmProposal.execute({
        userId: user.id,
        sessionId: session.id,
        proposalId: proposal.id,
        sets: [{ type: "WORKING", weightKg: 50, reps: -1 }],
      }),
    ).rejects.toThrow(ValidationError);

    // 6C: Conversão determinística de kg com casas decimais para gramas
    const validProposal = await confirmProposal.execute({
      userId: user.id,
      sessionId: session.id,
      proposalId: proposal.id,
      sets: [
        { type: "WARMUP", weightKg: 32.5, reps: 12, rir: null },
        { type: "WORKING", weightKg: 87.75, reps: 8, rir: 1 },
      ],
    });

    expect(validProposal.createdSets[0].weightInGrams).toBe(32500);
    expect(validProposal.createdSets[0].type).toBe("WARMUP");
    expect(validProposal.createdSets[1].weightInGrams).toBe(87750);
    expect(validProposal.createdSets[1].type).toBe("WORKING");
    expect(validProposal.createdSets[1].proposalId).toBe(proposal.id);
  });

  it("7. Consentimento LGPD independente (aiTrainingHistoryAccess) e isolamento do contexto", async () => {
    const { user, session, sessionExercise } = await createSessionFixture();

    // Inicia desativado por padrão
    const initialConsent = await getUserAiConsent.execute({ userId: user.id });
    expect(initialConsent.aiTrainingHistoryAccess).toBe(false);
    expect(initialConsent.aiTrainingHistoryConsentAt).toBeNull();

    // Contexto com consentimento desativado não traz histórico passado
    const contextWithoutConsent = await getSessionAiContext.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
    });
    expect(contextWithoutConsent.previousHistoryAllowed).toBe(false);
    expect(contextWithoutConsent.consentNotice).toContain("Consentimento");
    expect(contextWithoutConsent.exercises[0].recentHistory).toBeNull();

    // Ativação do consentimento pelo atleta
    const updatedConsent = await updateUserAiConsent.execute({
      userId: user.id,
      aiTrainingHistoryAccess: true,
    });
    expect(updatedConsent.aiTrainingHistoryAccess).toBe(true);
    expect(updatedConsent.aiTrainingHistoryConsentAt).toBeDefined();

    // Contexto com consentimento ativado fornece flag previousHistoryAllowed: true
    const contextWithConsent = await getSessionAiContext.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
    });
    expect(contextWithConsent.previousHistoryAllowed).toBe(true);
    expect(contextWithConsent.consentNotice).toBeNull();

    // Revogação do consentimento
    const revoked = await updateUserAiConsent.execute({
      userId: user.id,
      aiTrainingHistoryAccess: false,
    });
    expect(revoked.aiTrainingHistoryAccess).toBe(false);

    const contextAfterRevoke = await getSessionAiContext.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
    });
    expect(contextAfterRevoke.previousHistoryAllowed).toBe(false);
    expect(contextAfterRevoke.consentNotice).toContain("Consentimento");
  });

  it("8. Preservação da integridade histórica após substituição de exercício (Fix do bloqueio da Task 6.4)", async () => {
    const { user, session, sessionExercise, exerciseA, exerciseB } =
      await createSessionFixture();

    // Executa e registra 2 séries com Exercício A ("Supino Reto")
    const setA1 = await createWorkoutSet.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      type: SetType.WORKING,
      weightInGrams: 80000,
      reps: 10,
    });
    const setA2 = await createWorkoutSet.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      type: SetType.WORKING,
      weightInGrams: 85000,
      reps: 8,
    });

    expect(setA1.exerciseId).toBe(exerciseA.id);
    expect(setA1.exerciseNameSnapshot).toBe(exerciseA.name);
    expect(setA2.exerciseId).toBe(exerciseA.id);

    // Substitui o exercício da sessão para Exercício B ("Supino Inclinado")
    await substituteExercise.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      newExerciseId: exerciseB.id,
    });

    // Executa e registra mais 2 séries com o novo Exercício B
    const setB1 = await createWorkoutSet.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      type: SetType.WORKING,
      weightInGrams: 60000,
      reps: 10,
    });

    expect(setB1.exerciseId).toBe(exerciseB.id);
    expect(setB1.exerciseNameSnapshot).toBe(exerciseB.name);

    // Verifica no banco se as séries anteriores continuam com exerciseId = exerciseA.id
    const dbSets = await prisma.workoutSet.findMany({
      where: { sessionExerciseId: sessionExercise.id },
      orderBy: { order: "asc" },
    });

    expect(dbSets.length).toBe(3);
    // Séries 1 e 2 devem ser estritamente do exercício A
    expect(dbSets[0].exerciseId).toBe(exerciseA.id);
    expect(dbSets[0].exerciseNameSnapshot).toBe(exerciseA.name);
    expect(dbSets[1].exerciseId).toBe(exerciseA.id);
    expect(dbSets[1].exerciseNameSnapshot).toBe(exerciseA.name);

    // Série 3 deve ser estritamente do exercício B
    expect(dbSets[2].exerciseId).toBe(exerciseB.id);
    expect(dbSets[2].exerciseNameSnapshot).toBe(exerciseB.name);

    // Marca todas as séries como concluídas para poder finalizar a sessão
    await prisma.workoutSet.updateMany({
      where: { sessionExerciseId: sessionExercise.id },
      data: { completedAt: new Date() },
    });

    // Finaliza sessão para computar histórico
    await completeSession.execute({
      userId: user.id,
      sessionId: session.id,
    });

    // Consulta evolução de carga de cada exercício
    const evoA = await getExerciseEvolution.execute({
      userId: user.id,
      exerciseId: exerciseA.id,
    });
    // O PR do Supino Reto (A) deve ser 85kg (85000g)
    expect(evoA.loadPR?.weightInGrams).toBe(85000);

    const evoB = await getExerciseEvolution.execute({
      userId: user.id,
      exerciseId: exerciseB.id,
    });
    // O PR do Supino Inclinado (B) deve ser 60kg (60000g), não misturado com o exercício A
    expect(evoB.loadPR?.weightInGrams).toBe(60000);
  });
});
