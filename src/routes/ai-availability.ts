import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import z from "zod";

import { auth } from "../lib/auth.js";
import { AdminError } from "../lib/require-admin.js";
import { ErrorSchema } from "../schemas/index.js";
import {
  AiAvailability,
  AiPolicyConflictError,
} from "../usecases/AiAvailability.js";

const flags = z.object({
  professionalAiEnabled: z.boolean(),
  athleteAiEnabled: z.boolean(),
});
const policy = flags.extend({
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime().nullable(),
});
const body = flags
  .extend({ revision: z.number().int().nonnegative() })
  .strict();
export const aiAvailabilityRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/features/ai",
    {
      schema: {
        operationId: "getPublicAiAvailability",
        tags: ["Operations"],
        response: { 200: flags },
      },
    },
    async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return new AiAvailability().public();
    },
  );
  for (const method of ["GET", "PATCH"] as const) {
    app.route({
      method,
      url: "/admin/ai-availability",
      schema: {
        operationId:
          method === "GET"
            ? "getAdminAiAvailability"
            : "updateAdminAiAvailability",
        tags: ["Admin"],
        ...(method === "PATCH" ? { body } : {}),
        response: {
          200: policy,
          401: ErrorSchema,
          403: ErrorSchema,
          409: ErrorSchema,
          500: ErrorSchema,
        },
      },
      handler: async (request, reply) => {
        reply.header("Cache-Control", "no-store");
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session)
          return reply
            .code(401)
            .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        try {
          const service = new AiAvailability();
          return method === "GET"
            ? await service.get(session.user.id)
            : await service.update(session.user.id, body.parse(request.body));
        } catch (error) {
          if (error instanceof AdminError)
            return reply.code(403).send({
              error: "Acesso administrativo necessário.",
              code: error.code,
            });
          if (error instanceof AiPolicyConflictError)
            return reply
              .code(409)
              .send({ error: error.message, code: error.code });
          request.log.error({ event: "AI_AVAILABILITY_FAILED" });
          return reply.code(500).send({
            error: "Não foi possível consultar ou salvar a configuração.",
            code: "INTERNAL_SERVER_ERROR",
          });
        }
      },
    });
  }
};
