import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { env } from "../lib/env.js";
import { CronBillingReconciliationResponseSchema } from "../schemas/billing.js";
import {
  CronStreakRemindersResponseSchema,
  ErrorSchema,
} from "../schemas/index.js";
import { ApplicationAccessLogs } from "../usecases/ApplicationAccessLogs.js";
import { BillingReconciliation } from "../usecases/billing/BillingReconciliation.js";
import { CheckAndConsumeAiQuota } from "../usecases/CheckAndConsumeAiQuota.js";
import { SendStreakReminders } from "../usecases/SendStreakReminders.js";

export const cronRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/streak-reminders",
    schema: {
      operationId: "cronStreakReminders",
      tags: ["Cron"],
      summary: "Send streak reminder push notifications (Vercel Cron)",
      response: {
        200: CronStreakRemindersResponseSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      const authHeader = request.headers["authorization"];
      if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return reply.status(401).send({
          error: "Unauthorized: Invalid or missing CRON_SECRET token.",
          code: "UNAUTHORIZED",
        });
      }

      try {
        await new ApplicationAccessLogs().purgeExpired();
        await new CheckAndConsumeAiQuota().purgeExpiredRequests();
        const useCase = new SendStreakReminders();
        const sent = await useCase.execute();
        return reply.status(200).send({ sent });
      } catch (err) {
        app.log.error(err);
        return reply.status(500).send({
          error:
            err instanceof Error
              ? err.message
              : "Erro ao processar lembretes de sequência.",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/billing-reconciliation",
    schema: {
      operationId: "cronBillingReconciliation",
      tags: ["Cron"],
      summary: "Reconcile Asaas billing subscriptions, upgrades and downgrades (Vercel Cron)",
      response: {
        200: CronBillingReconciliationResponseSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      const authHeader = request.headers["authorization"];
      if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return reply.status(401).send({
          error: "Unauthorized: Invalid or missing CRON_SECRET token.",
          code: "UNAUTHORIZED",
        });
      }

      try {
        const result = await new BillingReconciliation().run();
        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err);
        return reply.status(500).send({
          error:
            err instanceof Error
              ? err.message
              : "Erro ao executar reconciliação de billing.",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });
};

