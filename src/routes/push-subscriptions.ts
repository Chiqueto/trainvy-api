import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { auth } from "../lib/auth.js";
import {
  ErrorSchema,
  RegisterPushSubscriptionBodySchema,
  RegisterPushSubscriptionResponseSchema,
  RevokePushSubscriptionBodySchema,
  RevokePushSubscriptionResponseSchema,
} from "../schemas/index.js";
import { RegisterPushSubscription } from "../usecases/RegisterPushSubscription.js";
import { RevokePushSubscription } from "../usecases/RevokePushSubscription.js";

export const pushSubscriptionRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
      operationId: "registerPushSubscription",
      tags: ["Push Notifications"],
      summary: "Register a push subscription for the current device",
      body: RegisterPushSubscriptionBodySchema,
      response: {
        201: RegisterPushSubscriptionResponseSchema,
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
        const useCase = new RegisterPushSubscription();
        const result = await useCase.execute({
          userId: session.user.id,
          ...request.body,
        });

        return reply.status(201).send(result);
      } catch (err) {
        app.log.error(err);
        return reply.status(500).send({
          error:
            err instanceof Error
              ? err.message
              : "Erro ao registrar inscrição push.",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: "DELETE",
    url: "/",
    schema: {
      operationId: "revokePushSubscription",
      tags: ["Push Notifications"],
      summary: "Revoke a push subscription",
      body: RevokePushSubscriptionBodySchema,
      response: {
        200: RevokePushSubscriptionResponseSchema,
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
        const useCase = new RevokePushSubscription();
        const result = await useCase.execute({
          userId: session.user.id,
          endpoint: request.body.endpoint,
        });

        return reply.status(200).send(result);
      } catch (err) {
        app.log.error(err);
        return reply.status(500).send({
          error:
            err instanceof Error
              ? err.message
              : "Erro ao revogar inscrição push.",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });
};

