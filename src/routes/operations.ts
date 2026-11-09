import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import z from "zod";

import { auth } from "../lib/auth.js";
import { AdminError } from "../lib/require-admin.js";
import { ErrorSchema } from "../schemas/index.js";
import { CheckReadiness } from "../usecases/CheckReadiness.js";
import { ListAdminFeedback } from "../usecases/ListAdminFeedback.js";

const Status = z.object({ status: z.enum(["ok", "unavailable"]) });
export const operationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health/live",
    {
      schema: {
        operationId: "getLiveness",
        tags: ["Operations"],
        response: { 200: Status },
      },
    },
    async () => ({ status: "ok" as const }),
  );
  app.get(
    "/health/ready",
    {
      schema: {
        operationId: "getReadiness",
        tags: ["Operations"],
        response: { 200: Status, 503: Status },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        return await new CheckReadiness().execute();
      } catch {
        request.log.error({ event: "READINESS_FAILED" });
        return reply.code(503).send({ status: "unavailable" });
      }
    },
  );
  app.get(
    "/admin/feedback",
    {
      schema: {
        operationId: "listAdminFeedback",
        tags: ["Admin"],
        querystring: z.object({
          cursor: z.string().min(1).max(200).optional(),
          category: z
            .enum(["BUG", "SUGGESTION", "QUESTION", "OTHER"])
            .optional(),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        }),
        response: {
          200: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                category: z.string(),
                message: z.string(),
                createdAt: z.string().datetime(),
                user: z.object({ name: z.string(), email: z.string() }),
              }),
            ),
            nextCursor: z.string().nullable(),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (!session)
        return reply
          .code(401)
          .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
      try {
        return await new ListAdminFeedback().execute({
          adminUserId: session.user.id,
          ...request.query,
        });
      } catch (error) {
        if (error instanceof AdminError)
          return reply
            .code(403)
            .send({
              error: "Acesso administrativo necessário.",
              code: error.code,
            });
        request.log.error({ event: "FEEDBACK_LIST_FAILED" });
        return reply
          .code(500)
          .send({
            error: "Não foi possível consultar os feedbacks.",
            code: "INTERNAL_SERVER_ERROR",
          });
      }
    },
  );
};
