import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { describe, expect, it } from "vitest";

import { AiRateLimitError } from "../../src/errors/index.js";
import { prisma } from "../../src/lib/db.js";
import { CheckAndConsumeAiQuota } from "../../src/usecases/CheckAndConsumeAiQuota.js";

dayjs.extend(utc);

describe("AI Beta Rate Limiting & Safe Quotas (Task 5.1)", () => {
  const createTestUser = async (email: string) => {
    return prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Test Athlete",
        email,
      },
    });
  };

  it("permite mensagens dentro da cota configurada", async () => {
    const user = await createTestUser(`athlete-quota-1-${Date.now()}@test.com`);
    const limiter = new CheckAndConsumeAiQuota();

    const result = await limiter.execute({
      userId: user.id,
      config: { dailyUserLimit: 5, minuteUserLimit: 5 },
    });

    expect(result.currentDailyCount).toBe(1);
    expect(result.remainingDailyQuota).toBe(4);
    expect(result.resetAt).toBeDefined();
  });

  it("bloqueia e lança erro 429 com AI_DAILY_QUOTA_EXCEEDED ao estourar o limite diário", async () => {
    const user = await createTestUser(`athlete-quota-2-${Date.now()}@test.com`);
    const limiter = new CheckAndConsumeAiQuota();

    // Consome 2 mensagens com cota máxima de 2
    await limiter.execute({
      userId: user.id,
      config: { dailyUserLimit: 2, minuteUserLimit: 10 },
    });
    await limiter.execute({
      userId: user.id,
      config: { dailyUserLimit: 2, minuteUserLimit: 10 },
    });

    // 3ª mensagem deve ser bloqueada
    await expect(
      limiter.execute({
        userId: user.id,
        config: { dailyUserLimit: 2, minuteUserLimit: 10 },
      }),
    ).rejects.toThrow(AiRateLimitError);

    // Confirma que a contagem no banco não inflou além do limite após a rejeição
    const dateStr = dayjs.utc().format("YYYY-MM-DD");
    const usage = await prisma.aiUsageDaily.findUnique({
      where: { userId_date: { userId: user.id, date: dateStr } },
    });
    expect(usage?.count).toBe(2);
  });

  it("bloqueia rajada com AI_MINUTE_LIMIT_EXCEEDED se exceder mensagens por minuto", async () => {
    const user = await createTestUser(`athlete-burst-${Date.now()}@test.com`);
    const limiter = new CheckAndConsumeAiQuota();

    // 2 mensagens permitidas com limite de 2 por minuto
    await limiter.execute({
      userId: user.id,
      config: { dailyUserLimit: 10, minuteUserLimit: 2 },
    });
    await limiter.execute({
      userId: user.id,
      config: { dailyUserLimit: 10, minuteUserLimit: 2 },
    });

    // 3ª mensagem imediata no mesmo minuto
    await expect(
      limiter.execute({
        userId: user.id,
        config: { dailyUserLimit: 10, minuteUserLimit: 2 },
      }),
    ).rejects.toThrow("Você enviou muitas mensagens em sequência");
  });

  it("preserva isolamento estrito entre usuários diferentes", async () => {
    const userA = await createTestUser(`userA-${Date.now()}@test.com`);
    const userB = await createTestUser(`userB-${Date.now()}@test.com`);
    const limiter = new CheckAndConsumeAiQuota();

    // User A esgota sua cota diária
    await limiter.execute({
      userId: userA.id,
      config: { dailyUserLimit: 1, minuteUserLimit: 10 },
    });

    await expect(
      limiter.execute({
        userId: userA.id,
        config: { dailyUserLimit: 1, minuteUserLimit: 10 },
      }),
    ).rejects.toThrow(AiRateLimitError);

    // User B ainda tem sua cota intacta
    const resultB = await limiter.execute({
      userId: userB.id,
      config: { dailyUserLimit: 1, minuteUserLimit: 10 },
    });

    expect(resultB.currentDailyCount).toBe(1);
  });

  it("gerencia requisições simultâneas sem ultrapassar o limite", async () => {
    const user = await createTestUser(`concurrent-${Date.now()}@test.com`);
    const limiter = new CheckAndConsumeAiQuota();

    // Dispara 5 requisições paralelas com limite diário = 3 e minuteLimit = 10
    const results = await Promise.allSettled([
      limiter.execute({ userId: user.id, config: { dailyUserLimit: 3, minuteUserLimit: 10 } }),
      limiter.execute({ userId: user.id, config: { dailyUserLimit: 3, minuteUserLimit: 10 } }),
      limiter.execute({ userId: user.id, config: { dailyUserLimit: 3, minuteUserLimit: 10 } }),
      limiter.execute({ userId: user.id, config: { dailyUserLimit: 3, minuteUserLimit: 10 } }),
      limiter.execute({ userId: user.id, config: { dailyUserLimit: 3, minuteUserLimit: 10 } }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(3);
    expect(rejected.length).toBe(2);

    const dateStr = dayjs.utc().format("YYYY-MM-DD");
    const usage = await prisma.aiUsageDaily.findUnique({
      where: { userId_date: { userId: user.id, date: dateStr } },
    });
    expect(usage?.count).toBe(3);
  });

  it("resolve limite diário de 5 mensagens para atleta e retorna status correto", async () => {
    const user = await createTestUser(`athlete-default-${Date.now()}@test.com`);
    const limiter = new CheckAndConsumeAiQuota();

    const statusBefore = await limiter.getStatus(user.id);
    expect(statusBefore.dailyLimit).toBe(5);
    expect(statusBefore.currentDailyCount).toBe(0);
    expect(statusBefore.remainingDailyQuota).toBe(5);
    expect(statusBefore.isAthlete).toBe(true);

    const result = await limiter.execute({ userId: user.id });
    expect(result.dailyLimit).toBe(5);
    expect(result.currentDailyCount).toBe(1);
    expect(result.remainingDailyQuota).toBe(4);

    const statusAfter = await limiter.getStatus(user.id);
    expect(statusAfter.currentDailyCount).toBe(1);
    expect(statusAfter.remainingDailyQuota).toBe(4);
  });

  it("respeita alteração dinâmica do limite configurada no plano via admin", async () => {
    const user = await createTestUser(`athlete-admin-plan-${Date.now()}@test.com`);
    const planCode = `TEST_PLAN_${Date.now()}`;
    const plan = await prisma.plan.create({
      data: {
        code: planCode,
        name: "Plano Teste Admin",
        audience: "ATHLETE",
        monthlyPriceInCents: 0,
        currency: "BRL",
        entitlements: {
          create: [{ entitlement: "AI_CHAT", limitValue: 8 }],
        },
      },
    });

    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: "ACTIVE",
        priceInCentsSnapshot: 0,
        currencySnapshot: "BRL",
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { accountSetupCompletedAt: new Date() },
    });

    const limiter = new CheckAndConsumeAiQuota();
    const status1 = await limiter.getStatus(user.id);
    expect(status1.dailyLimit).toBe(8);
    expect(status1.remainingDailyQuota).toBe(8);

    // Simula a alteração feita pelo admin no /admin/plans para 12 mensagens
    await prisma.planEntitlement.updateMany({
      where: { planId: plan.id, entitlement: "AI_CHAT" },
      data: { limitValue: 12 },
    });

    const status2 = await limiter.getStatus(user.id);
    expect(status2.dailyLimit).toBe(12);
    expect(status2.remainingDailyQuota).toBe(12);
  });
});
