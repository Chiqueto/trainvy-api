import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { AiRateLimitError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

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
  resetAt: string;
}

export class CheckAndConsumeAiQuota {
  async execute(
    input: CheckAndConsumeAiQuotaInput,
  ): Promise<CheckAndConsumeAiQuotaOutput> {
    const { userId } = input;

    // 1. Configurações e limites (variáveis de ambiente ou defaults de segurança)
    const dailyUserLimit =
      input.config?.dailyUserLimit ??
      (process.env.AI_DAILY_USER_LIMIT
        ? parseInt(process.env.AI_DAILY_USER_LIMIT, 10)
        : 15);

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

      throw new AiRateLimitError(
        `Você atingiu o limite diário do Coach IA nesta versão de testes (${dailyUserLimit} mensagens/dia). Seu acesso será renovado automaticamente à meia-noite UTC (21h Brasília).`,
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
      resetAt: nextMidnightUtc,
    };
  }
}
