import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { AiRateLimitError } from "../errors/index.js";
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

export class CheckAndConsumeAiQuota {
  async resolveUserLimit(userId: string): Promise<{
    dailyLimit: number;
    isAthlete: boolean;
    planName: string | null;
  }> {
    try {
      const commercial = await new GetCommercialContext().execute({ userId });

      if (
        commercial.systemRole === "ADMIN" ||
        commercial.plan?.code === "INTERNAL"
      ) {
        return { dailyLimit: 200, isAthlete: false, planName: "Admin/Interno" };
      }

      // 1. Verifica se o plano do usuário possui o entitlement AI_CHAT configurado no Admin
      const aiChatEntitlement = commercial.entitlements.find(
        (e) => e.key === "AI_CHAT",
      );
      if (
        aiChatEntitlement &&
        typeof aiChatEntitlement.limitValue === "number" &&
        aiChatEntitlement.limitValue >= 0
      ) {
        return {
          dailyLimit: aiChatEntitlement.limitValue,
          isAthlete: commercial.accountType === "ATHLETE",
          planName: commercial.plan?.name ?? null,
        };
      }

      if (commercial.accountType === "COACH") {
        return {
          dailyLimit: 30,
          isAthlete: false,
          planName: commercial.plan?.name ?? "Coach",
        };
      }

      // 2. Para ATHLETE: busca a configuração do plano ATHLETE_FREE salva no banco pelo /admin
      const freePlan = await prisma.plan.findUnique({
        where: { code: "ATHLETE_FREE" },
        include: { entitlements: true },
      });
      const freeChatEntitlement = freePlan?.entitlements.find(
        (e) => e.entitlement === "AI_CHAT",
      );
      if (
        freeChatEntitlement &&
        typeof freeChatEntitlement.limitValue === "number" &&
        freeChatEntitlement.limitValue >= 0
      ) {
        return {
          dailyLimit: freeChatEntitlement.limitValue,
          isAthlete: true,
          planName: freePlan?.name ?? "Atleta Grátis",
        };
      }

      // Fallback padrão se não houver registro no banco
      return {
        dailyLimit: 5,
        isAthlete: true,
        planName: freePlan?.name ?? "Atleta Grátis",
      };
    } catch {
      return {
        dailyLimit: 5,
        isAthlete: true,
        planName: null,
      };
    }
  }

  async getStatus(userId: string): Promise<AiQuotaStatus> {
    const resolved = await this.resolveUserLimit(userId);
    const nowUtc = dayjs.utc();
    const dateStr = nowUtc.format("YYYY-MM-DD");
    const nextMidnightUtc = nowUtc.add(1, "day").startOf("day").toISOString();

    const usage = await prisma.aiUsageDaily.findUnique({
      where: {
        userId_date: {
          userId,
          date: dateStr,
        },
      },
    });

    const currentDailyCount = usage?.count ?? 0;
    return {
      currentDailyCount,
      remainingDailyQuota: Math.max(0, resolved.dailyLimit - currentDailyCount),
      dailyLimit: resolved.dailyLimit,
      resetAt: nextMidnightUtc,
      isAthlete: resolved.isAthlete,
      planName: resolved.planName,
    };
  }

  async execute(
    input: CheckAndConsumeAiQuotaInput,
  ): Promise<CheckAndConsumeAiQuotaOutput> {
    const { userId } = input;

    // 1. Configurações e limites (respeita config explícita se fornecida, senão resolve por plano/perfil)
    const resolved =
      input.config?.dailyUserLimit !== undefined
        ? {
            dailyLimit: input.config.dailyUserLimit,
            isAthlete: false,
            planName: null,
          }
        : await this.resolveUserLimit(userId);

    const dailyUserLimit = resolved.dailyLimit;

    const minuteUserLimit =
      input.config?.minuteUserLimit ??
      (process.env.AI_MINUTE_USER_LIMIT
        ? parseInt(process.env.AI_MINUTE_USER_LIMIT, 10)
        : 3);

    const dailyGlobalLimit =
      input.config?.dailyGlobalLimit ??
      (process.env.AI_DAILY_GLOBAL_LIMIT
        ? parseInt(process.env.AI_DAILY_GLOBAL_LIMIT, 10)
        : 500);

    const nowUtc = dayjs.utc();
    const dateStr = nowUtc.format("YYYY-MM-DD");
    const nextMidnightUtc = nowUtc.add(1, "day").startOf("day").toISOString();

    // 2. Proteção contra rajadas (burst limit por minuto por atleta)
    const oneMinuteAgo = nowUtc.subtract(1, "minute").toDate();
    const recentLogsCount = await prisma.aiRequestLog.count({
      where: {
        userId,
        createdAt: { gte: oneMinuteAgo },
      },
    });

    if (recentLogsCount >= minuteUserLimit) {
      throw new AiRateLimitError(
        `Você enviou muitas mensagens em sequência. O limite é de ${minuteUserLimit} mensagens por minuto no beta. Aguarde alguns instantes.`,
        "AI_MINUTE_LIMIT_EXCEEDED",
      );
    }

    // 3. Teto global diário de proteção de infraestrutura
    const globalUsageAgg = await prisma.aiUsageDaily.aggregate({
      _sum: { count: true },
      where: { date: dateStr },
    });

    const currentGlobalCount = globalUsageAgg._sum.count ?? 0;
    if (currentGlobalCount >= dailyGlobalLimit) {
      throw new AiRateLimitError(
        "O limite de capacidade diária global do Coach IA foi atingido temporariamente nesta versão de testes. Seu acesso será renovado em breve.",
        "AI_GLOBAL_LIMIT_EXCEEDED",
        nextMidnightUtc,
      );
    }

    // 4. Reserva atômica da cota diária do usuário
    const usage = await prisma.aiUsageDaily.upsert({
      where: {
        userId_date: {
          userId,
          date: dateStr,
        },
      },
      create: {
        userId,
        date: dateStr,
        count: 1,
      },
      update: {
        count: {
          increment: 1,
        },
      },
    });

    if (usage.count > dailyUserLimit) {
      // Reverte o incremento atômico da tentativa bloqueada para não queimar saldo indevidamente
      await prisma.aiUsageDaily.update({
        where: { id: usage.id },
        data: {
          count: {
            decrement: 1,
          },
        },
      });

      const label = resolved.isAthlete
        ? `limite diário gratuito de ${dailyUserLimit} mensagens`
        : `limite diário de ${dailyUserLimit} mensagens`;

      throw new AiRateLimitError(
        `Você atingiu o ${label} do Coach IA. Seu acesso será renovado automaticamente à meia-noite UTC (21h Brasília).`,
        "AI_DAILY_QUOTA_EXCEEDED",
        nextMidnightUtc,
      );
    }

    // 5. Registra log para o controle de burst rate da janela deslizante
    await prisma.aiRequestLog.create({
      data: {
        userId,
      },
    });

    // 6. Limpeza não bloqueante de logs antigos de janela (> 2 horas)
    prisma.aiRequestLog
      .deleteMany({
        where: {
          createdAt: {
            lt: nowUtc.subtract(2, "hours").toDate(),
          },
        },
      })
      .catch(() => {});

    return {
      currentDailyCount: usage.count,
      remainingDailyQuota: Math.max(0, dailyUserLimit - usage.count),
      dailyLimit: dailyUserLimit,
      resetAt: nextMidnightUtc,
    };
  }
}
