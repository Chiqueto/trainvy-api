import { describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/db.js";
import { GetUserMetricsHistory } from "../../src/usecases/GetUserMetricsHistory.js";
import { GetUserTrainData } from "../../src/usecases/GetUserTrainData.js";
import { UpsertUserTrainData } from "../../src/usecases/UpsertUserTrainData.js";
import { createTestUser } from "../helpers/test-db.js";

describe("User Metrics & History Tracker", () => {
  it("deve criar registro em user_metric_log ao atualizar dados corporais pela primeira vez", async () => {
    const user = await createTestUser();
    const upsert = new UpsertUserTrainData();

    await upsert.execute({
      userId: user.id,
      weightInGrams: 80000,
      heightInCentimeters: 180,
      age: 26,
      bodyFatPercentage: 16,
    });

    const logs = await prisma.userMetricLog.findMany({
      where: { userId: user.id },
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].weightInGrams).toBe(80000);
    expect(logs[0].bodyFatPercentage).toBe(16);
    expect(logs[0].heightInCentimeters).toBe(180);
    expect(logs[0].age).toBe(26);
  });

  it("deve calcular variação recente em GetUserTrainData quando houver mais de uma pesagem", async () => {
    const user = await createTestUser();
    const upsert = new UpsertUserTrainData();
    const getTrainData = new GetUserTrainData();

    // Primeira pesagem (80kg, 16% BF)
    await upsert.execute({
      userId: user.id,
      weightInGrams: 80000,
      heightInCentimeters: 180,
      age: 26,
      bodyFatPercentage: 16,
    });

    const initialData = await getTrainData.execute({ userId: user.id });
    expect(initialData?.previousWeightInGrams).toBeNull();
    expect(initialData?.weightDiffInGrams).toBeNull();

    // Segunda pesagem (78.5kg, 14% BF - atleta perdeu 1.5kg e 2% BF)
    await upsert.execute({
      userId: user.id,
      weightInGrams: 78500,
      heightInCentimeters: 180,
      age: 26,
      bodyFatPercentage: 14,
    });

    const updatedData = await getTrainData.execute({ userId: user.id });
    expect(updatedData?.weightInGrams).toBe(78500);
    expect(updatedData?.previousWeightInGrams).toBe(80000);
    expect(updatedData?.weightDiffInGrams).toBe(-1500); // -1.5kg
    expect(updatedData?.bodyFatDiff).toBe(-2); // -2% BF
  });

  it("deve retornar histórico completo de métricas com diferenças em GetUserMetricsHistory", async () => {
    const user = await createTestUser();
    const upsert = new UpsertUserTrainData();
    const getHistory = new GetUserMetricsHistory();

    // 1º registro: 85kg, 20% BF
    await upsert.execute({
      userId: user.id,
      weightInGrams: 85000,
      heightInCentimeters: 175,
      age: 30,
      bodyFatPercentage: 20,
    });

    // 2º registro: 82kg, 18% BF
    await upsert.execute({
      userId: user.id,
      weightInGrams: 82000,
      heightInCentimeters: 175,
      age: 30,
      bodyFatPercentage: 18,
    });

    // 3º registro: 80.5kg, 17% BF
    await upsert.execute({
      userId: user.id,
      weightInGrams: 80500,
      heightInCentimeters: 175,
      age: 30,
      bodyFatPercentage: 17,
    });

    const history = await getHistory.execute({ userId: user.id });
    expect(history).toHaveLength(3);

    // O mais recente é o primeiro (80.5kg)
    expect(history[0].weightKg).toBe(80.5);
    expect(history[0].weightDiffKg).toBe(-1.5); // 80.5 - 82
    expect(history[0].bodyFatDiff).toBe(-1); // 17 - 18

    // O segundo mais recente (82kg)
    expect(history[1].weightKg).toBe(82);
    expect(history[1].weightDiffKg).toBe(-3); // 82 - 85
    expect(history[1].bodyFatDiff).toBe(-2); // 18 - 20

    // O mais antigo (85kg) não tem anterior
    expect(history[2].weightKg).toBe(85);
    expect(history[2].weightDiffKg).toBeNull();
    expect(history[2].bodyFatDiff).toBeNull();
  });
});
