import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import {
  AiAccessError,
  type AiEntitlement,
  resolveAiAccess,
} from "../domain/ai-access.js";
import { AiRateLimitError } from "../errors/index.js";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

dayjs.extend(utc);

export interface AiQuotaConfig {
  dailyUserLimit?: number;
  minuteUserLimit?: number;
  dailyGlobalLimit?: number;
}
export interface CheckAndConsumeAiQuotaInput {
  userId: string;
  entitlement?: AiEntitlement;
  config?: AiQuotaConfig;
}
export interface CheckAndConsumeAiQuotaOutput {
  currentDailyCount: number;
  remainingDailyQuota: number;
  dailyLimit: number;
  resetAt: string;
}
export interface AiQuotaStatus extends CheckAndConsumeAiQuotaOutput {
  isAthlete: boolean;
  planName: string | null;
}
function limit(
  value: number | undefined,
  envValue: string | undefined,
  fallback: number,
) {
  const result =
    value ?? (envValue === undefined ? fallback : Number(envValue));
  if (!Number.isSafeInteger(result) || result < 0)
    throw new Error("Invalid AI quota configuration");
  return result;
}
export class CheckAndConsumeAiQuota {
  async purgeExpiredRequests() {
    return prisma.aiRequestLog.deleteMany({
      where: { createdAt: { lt: dayjs.utc().subtract(2, "hours").toDate() } },
    });
  }
  async resolveUserLimit(
    userId: string,
    entitlement: AiEntitlement = "AI_CHAT",
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ) {
    const commercial = await new GetCommercialContext().execute({
      userId,
      client,
    });
    return resolveAiAccess(commercial, entitlement);
  }
  async getStatus(userId: string): Promise<AiQuotaStatus> {
    const resolved = await this.resolveUserLimit(userId);
    const now = dayjs.utc();
    const usage = await prisma.aiUsageDaily.findUnique({
      where: { userId_date: { userId, date: now.format("YYYY-MM-DD") } },
    });
    const currentDailyCount = usage?.count ?? 0;
    return {
      currentDailyCount,
      remainingDailyQuota: Math.max(0, resolved.dailyLimit - currentDailyCount),
      dailyLimit: resolved.dailyLimit,
      resetAt: now.add(1, "day").startOf("day").toISOString(),
      isAthlete: resolved.isAthlete,
      planName: resolved.planName,
    };
  }
  async execute(
    input: CheckAndConsumeAiQuotaInput,
  ): Promise<CheckAndConsumeAiQuotaOutput> {
    const { userId } = input;
    const minuteUserLimit = limit(
      input.config?.minuteUserLimit,
      process.env.AI_MINUTE_USER_LIMIT,
      3,
    );
    const dailyGlobalLimit = limit(
      input.config?.dailyGlobalLimit,
      process.env.AI_DAILY_GLOBAL_LIMIT,
      500,
    );
    return prisma.$transaction(
      async (tx) => {
        // Reserve all AI channels under one lock; no provider runs within this transaction.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('trainvy:ai-quota-reservation'))`;
        const now = dayjs.utc();
        const date = now.format("YYYY-MM-DD");
        const resetAt = now.add(1, "day").startOf("day").toISOString();
        // Explicit overrides are internal only, never accepted by an HTTP schema.
        const resolved =
          input.config?.dailyUserLimit !== undefined
            ? {
                enabled: true,
                dailyLimit: limit(input.config.dailyUserLimit, undefined, 0),
              }
            : await this.resolveUserLimit(userId, input.entitlement, tx);
        if (!resolved.enabled) throw new AiAccessError();
        const usage = await tx.aiUsageDaily.findUnique({
          where: { userId_date: { userId, date } },
        });
        if ((usage?.count ?? 0) >= resolved.dailyLimit)
          throw new AiRateLimitError(
            `Você atingiu o limite diário de ${resolved.dailyLimit} solicitações de IA, compartilhado entre chat, fichas e análises.`,
            "AI_DAILY_QUOTA_EXCEEDED",
            resetAt,
          );
        const recent = await tx.aiRequestLog.count({
          where: {
            userId,
            createdAt: { gte: now.subtract(1, "minute").toDate() },
          },
        });
        if (recent >= minuteUserLimit)
          throw new AiRateLimitError(
            "Você enviou muitas mensagens em sequência. Aguarde um minuto antes de solicitar outra resposta da IA.",
            "AI_MINUTE_LIMIT_EXCEEDED",
            now.add(1, "minute").toISOString(),
          );
        const global = await tx.aiUsageDaily.aggregate({
          _sum: { count: true },
          where: { date },
        });
        if ((global._sum.count ?? 0) >= dailyGlobalLimit)
          throw new AiRateLimitError(
            "A capacidade diária de IA foi atingida. Seus treinos continuam disponíveis.",
            "AI_GLOBAL_LIMIT_EXCEEDED",
            resetAt,
          );
        const reserved = await tx.aiUsageDaily.upsert({
          where: { userId_date: { userId, date } },
          create: { userId, date, count: 1 },
          update: { count: { increment: 1 } },
        });
        await tx.aiRequestLog.create({ data: { userId } });
        return {
          currentDailyCount: reserved.count,
          remainingDailyQuota: Math.max(
            0,
            resolved.dailyLimit - reserved.count,
          ),
          dailyLimit: resolved.dailyLimit,
          resetAt,
        };
      },
      { maxWait: 15000, timeout: 15000 },
    );
  }
}
