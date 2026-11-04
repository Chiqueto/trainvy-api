import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { env } from "../lib/env.js";
import {
  CronStreakRemindersResponseSchema,
  ErrorSchema,
} from "../schemas/index.js";
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
};

