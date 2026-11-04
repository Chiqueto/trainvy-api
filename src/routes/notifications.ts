import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { NotFoundError } from "../errors/index.js";
import { auth } from "../lib/auth.js";
import {
  ErrorSchema,
  ListNotificationsQuerySchema,
  ListNotificationsResponseSchema,
  MarkAllNotificationsReadResponseSchema,
  MarkNotificationReadParamsSchema,
  MarkNotificationReadResponseSchema,
} from "../schemas/index.js";
import { ListNotifications } from "../usecases/ListNotifications.js";
import { MarkAllNotificationsRead } from "../usecases/MarkAllNotificationsRead.js";
import { MarkNotificationRead } from "../usecases/MarkNotificationRead.js";

export const notificationRoutes = async (app: FastifyInstance) => {
  // GET / — List notifications
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/",
    schema: {
      operationId: "listNotifications",
      tags: ["Notifications"],
      summary: "List user notifications with cursor pagination",
      querystring: ListNotificationsQuerySchema,
      response: {
        200: ListNotificationsResponseSchema,
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
        const useCase = new ListNotifications();
        const result = await useCase.execute({
          userId: session.user.id,
          cursor: request.query.cursor,
          limit: request.query.limit,
        });

        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err);
        return reply.status(500).send({
          error:
            err instanceof Error
              ? err.message
              : "Erro ao listar notificações.",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });

  // PATCH /:id/read — Mark one notification as read
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "PATCH",
    url: "/:id/read",
    schema: {
      operationId: "markNotificationRead",
      tags: ["Notifications"],
      summary: "Mark a single notification as read",
      params: MarkNotificationReadParamsSchema,
      response: {
        200: MarkNotificationReadResponseSchema,
        401: ErrorSchema,
        404: ErrorSchema,
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
        const useCase = new MarkNotificationRead();
        const result = await useCase.execute({
          userId: session.user.id,
          id: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({
            error: err.message,
            code: "NOT_FOUND",
          });
        }
        app.log.error(err);
        return reply.status(500).send({
          error:
            err instanceof Error
              ? err.message
              : "Erro ao marcar notificação como lida.",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });

  // POST /read-all — Mark all notifications as read
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/read-all",
    schema: {
      operationId: "markAllNotificationsRead",
      tags: ["Notifications"],
      summary: "Mark all notifications as read",
      response: {
        200: MarkAllNotificationsReadResponseSchema,
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
        const useCase = new MarkAllNotificationsRead();
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
              : "Erro ao marcar todas as notificações como lidas.",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });
};

