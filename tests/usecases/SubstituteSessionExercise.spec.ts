import { afterEach, describe, expect, it } from "vitest";

import {
  NotFoundError,
  WorkoutSessionAlreadyCompletedError,
} from "../../src/errors/index.js";
import { prisma } from "../../src/lib/db.js";
import { StartWorkoutSession } from "../../src/usecases/StartWorkoutSession.js";
import { SubstituteSessionExercise } from "../../src/usecases/SubstituteSessionExercise.js";
import {
  cleanupTestUsers,
  createTestExercise,
  createTestUser,
  createTestWorkoutDay,
  createTestWorkoutExercise,
  createTestWorkoutPlan,
} from "../helpers/test-db.js";

describe("SubstituteSessionExercise Integration Tests (Task 6.4)", () => {
  const createdUserIds: string[] = [];
  const startWorkoutSession = new StartWorkoutSession();
  const substituteSessionExercise = new SubstituteSessionExercise();

  afterEach(async () => {
    await cleanupTestUsers(createdUserIds);
    createdUserIds.length = 0;
  });

  it("substitui exercício na sessão ativa preservando sets e sem alterar o WorkoutPlan original", async () => {
    const user = await createTestUser({ name: "Atleta Teste Substituicao" });
    createdUserIds.push(user.id);

    // 1. Cria catálogo de exercícios
    const exMain = await createTestExercise("Supino Reto com Barra");
    const exAlt1 = await createTestExercise("Supino Reto com Halteres");
    const exAlt2 = await createTestExercise("Supino Articulado Máquina");

    // 2. Cria plano com alternativas
    const plan = await createTestWorkoutPlan(user.id, {
      name: "Plano Força",
      isActive: true,
    });
    const day = await createTestWorkoutDay(plan.id, { name: "Treino Peito" });
    const workoutExercise = await prisma.workoutExercise.create({
      data: {
        workoutDayId: day.id,
        name: exMain.name,
        order: 1,
        sets: 3,
        warmupSets: 1,
        reps: 10,
        restTimeInSeconds: 90,
        exerciseId: exMain.id,
        alternative1ExerciseId: exAlt1.id,
        alternative2ExerciseId: exAlt2.id,
      },
    });

    // 3. Inicia sessão
    const started = await startWorkoutSession.execute({
      userId: user.id,
      workoutPlanId: plan.id,
      workoutDayId: day.id,
    });

    const sessionExerciseId = started.exercises[0].id;

    // Adiciona uma série preenchida para testar preservação de dados
    const existingSets = await prisma.workoutSet.findMany({
      where: { sessionExerciseId },
      orderBy: { order: "asc" },
    });
    expect(existingSets.length).toBe(4); // 1 warmup + 3 working

    await prisma.workoutSet.update({
      where: { id: existingSets[0].id },
      data: {
        weightInGrams: 40000,
        reps: 12,
        completedAt: new Date(),
      },
    });

    // 4. Executa a substituição para a alternativa 1
    const result = await substituteSessionExercise.execute({
      userId: user.id,
      sessionId: started.userWorkoutSessionId,
      sessionExerciseId,
      newExerciseId: exAlt1.id,
    });

    // Validações do retorno
    expect(result.wasSubstituted).toBe(true);
    expect(result.substitutedAt).not.toBeNull();
    expect(result.exerciseId).toBe(exAlt1.id);
    expect(result.exerciseNameSnapshot).toBe(exAlt1.name);
    expect(result.plannedExerciseId).toBe(exMain.id);
    expect(result.plannedExerciseNameSnapshot).toBe(exMain.name);
    expect(result.alternative1ExerciseId).toBe(exAlt1.id);
    expect(result.alternative2ExerciseId).toBe(exAlt2.id);

    // Valida que os sets continuam intactos e com o mesmo ID
    expect(result.sets.length).toBe(4);
    expect(result.sets[0].id).toBe(existingSets[0].id);
    expect(result.sets[0].weightInGrams).toBe(40000);
    expect(result.sets[0].reps).toBe(12);

    // Valida que o WorkoutPlan original permaneceu estritamente intocado
    const originalExerciseInDb = await prisma.workoutExercise.findUnique({
      where: { id: workoutExercise.id },
    });
    expect(originalExerciseInDb?.exerciseId).toBe(exMain.id);
    expect(originalExerciseInDb?.name).toBe(exMain.name);
  });

  it("reverter para o exercício planejado original limpa wasSubstituted e substitutedAt", async () => {
    const user = await createTestUser({ name: "Atleta Reversao" });
    createdUserIds.push(user.id);

    const exMain = await createTestExercise("Agachamento Livre");
    const exAlt = await createTestExercise("Leg Press 45");

    const plan = await createTestWorkoutPlan(user.id, {
      name: "Plano Pernas",
      isActive: true,
    });
    const day = await createTestWorkoutDay(plan.id, { name: "Treino Pernas" });
    await prisma.workoutExercise.create({
      data: {
        workoutDayId: day.id,
        name: exMain.name,
        order: 1,
        sets: 3,
        reps: 10,
        restTimeInSeconds: 120,
        exerciseId: exMain.id,
        alternative1ExerciseId: exAlt.id,
      },
    });

    const started = await startWorkoutSession.execute({
      userId: user.id,
      workoutPlanId: plan.id,
      workoutDayId: day.id,
    });
    const sessionExerciseId = started.exercises[0].id;

    // Substitui
    await substituteSessionExercise.execute({
      userId: user.id,
      sessionId: started.userWorkoutSessionId,
      sessionExerciseId,
      newExerciseId: exAlt.id,
    });

    // Reverte
    const reverted = await substituteSessionExercise.execute({
      userId: user.id,
      sessionId: started.userWorkoutSessionId,
      sessionExerciseId,
      newExerciseId: exMain.id,
    });

    expect(reverted.wasSubstituted).toBe(false);
    expect(reverted.substitutedAt).toBeNull();
    expect(reverted.exerciseId).toBe(exMain.id);
    expect(reverted.exerciseNameSnapshot).toBe(exMain.name);
    expect(reverted.plannedExerciseId).toBe(exMain.id);
  });

  it("bloqueia substituição por outro usuário (IDOR 404)", async () => {
    const user1 = await createTestUser({ name: "Atleta 1" });
    const user2 = await createTestUser({ name: "Atleta 2" });
    createdUserIds.push(user1.id, user2.id);

    const ex1 = await createTestExercise("Desenvolvimento Militar");
    const ex2 = await createTestExercise("Desenvolvimento com Halteres");

    const plan = await createTestWorkoutPlan(user1.id, {
      name: "Plano Ombros",
      isActive: true,
    });
    const day = await createTestWorkoutDay(plan.id, { name: "Treino Ombros" });
    await prisma.workoutExercise.create({
      data: {
        workoutDayId: day.id,
        name: ex1.name,
        order: 1,
        sets: 3,
        reps: 10,
        restTimeInSeconds: 90,
        exerciseId: ex1.id,
      },
    });

    const started = await startWorkoutSession.execute({
      userId: user1.id,
      workoutPlanId: plan.id,
      workoutDayId: day.id,
    });

    await expect(
      substituteSessionExercise.execute({
        userId: user2.id,
        sessionId: started.userWorkoutSessionId,
        sessionExerciseId: started.exercises[0].id,
        newExerciseId: ex2.id,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("bloqueia substituição em sessão já finalizada", async () => {
    const user = await createTestUser({ name: "Atleta Sessao Concluida" });
    createdUserIds.push(user.id);

    const ex1 = await createTestExercise("Barra Fixa");
    const ex2 = await createTestExercise("Puxada Frontal");

    const plan = await createTestWorkoutPlan(user.id, {
      name: "Plano Costas",
      isActive: true,
    });
    const day = await createTestWorkoutDay(plan.id, { name: "Treino Costas" });
    await prisma.workoutExercise.create({
      data: {
        workoutDayId: day.id,
        name: ex1.name,
        order: 1,
        sets: 3,
        reps: 8,
        restTimeInSeconds: 90,
        exerciseId: ex1.id,
      },
    });

    const started = await startWorkoutSession.execute({
      userId: user.id,
      workoutPlanId: plan.id,
      workoutDayId: day.id,
    });

    // Conclui a sessão
    await prisma.workoutSession.update({
      where: { id: started.userWorkoutSessionId },
      data: { completedAt: new Date() },
    });

    await expect(
      substituteSessionExercise.execute({
        userId: user.id,
        sessionId: started.userWorkoutSessionId,
        sessionExerciseId: started.exercises[0].id,
        newExerciseId: ex2.id,
      }),
    ).rejects.toThrow(WorkoutSessionAlreadyCompletedError);
  });

  it("executa backfill defensivo para sessões legadas sem plannedExerciseId", async () => {
    const user = await createTestUser({ name: "Atleta Legado" });
    createdUserIds.push(user.id);

    const ex1 = await createTestExercise("Rosca Direta com Barra");
    const ex2 = await createTestExercise("Rosca Alternada com Halteres");

    // Simula sessão legada
    const session = await prisma.workoutSession.create({
      data: {
        id: crypto.randomUUID(),
        origin: "FREE",
        athleteId: user.id,
        startedAt: new Date(),
      },
    });

    const sessionExercise = await prisma.sessionExercise.create({
      data: {
        id: crypto.randomUUID(),
        workoutSessionId: session.id,
        exerciseId: ex1.id,
        exerciseNameSnapshot: ex1.name,
        order: 1,
        plannedExerciseId: null, // Legado!
        plannedExerciseNameSnapshot: null,
      },
    });

    const substituted = await substituteSessionExercise.execute({
      userId: user.id,
      sessionId: session.id,
      sessionExerciseId: sessionExercise.id,
      newExerciseId: ex2.id,
    });

    expect(substituted.wasSubstituted).toBe(true);
    expect(substituted.plannedExerciseId).toBe(ex1.id);
    expect(substituted.plannedExerciseNameSnapshot).toBe(ex1.name);
    expect(substituted.exerciseId).toBe(ex2.id);
    expect(substituted.exerciseNameSnapshot).toBe(ex2.name);
  });
});
