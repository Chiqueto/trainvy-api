import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { auth } from "../lib/auth.js";
import {
  ErrorSchema,
  NotificationPreferencesSchema,
  UpdateNotificationPreferencesBodySchema,
} from "../schemas/index.js";
import { GetNotificationPreferences } from "../usecases/GetNotificationPreferences.js";
import { UpdateNotificationPreferences } from "../usecases/UpdateNotificationPreferences.js";

export const notificationPreferencesRoutes = async (app: FastifyInstance) => {
  // GET / — Obter preferências de notificação
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/",
    schema: {
      operationId: "getNotificationPreferences",
      tags: ["Notifications"],
      summary: "Get current user notification preferences",
      response: {
        200: NotificationPreferencesSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply
          .status(401)
          .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
      }

      try {
        const useCase = new GetNotificationPreferences();
        const result = await useCase.execute({
          userId: session.user.id,
        });

        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err);
        return reply.status(500).send({
          error:
            err instanceof Error
              ? err.message
              : "Erro ao buscar preferências de notificação.",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });

  // PATCH / — Atualizar preferências de notificação
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "PATCH",
    url: "/",
    schema: {
      operationId: "updateNotificationPreferences",
      tags: ["Notifications"],
      summary: "Update current user notification preferences",
      body: UpdateNotificationPreferencesBodySchema,
      response: {
        200: NotificationPreferencesSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply
          .status(401)
          .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
      }

      try {
        const useCase = new UpdateNotificationPreferences();
        const result = await useCase.execute({
          userId: session.user.id,
          ...request.body,
        });

        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err);
        return reply.status(500).send({
          error:
            err instanceof Error
              ? err.message
              : "Erro ao atualizar preferências de notificação.",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });
};

