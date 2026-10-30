import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

import { featureKeys,FeatureTermsError } from "../domain/feature-terms.js";
import { auth } from "../lib/auth.js";
import { FeatureTerms } from "../usecases/FeatureTerms.js";

const params = z.object({ feature: z.enum(featureKeys) });
const statusSchema = z.object({
  feature: z.enum(featureKeys),
  version: z.string(),
  title: z.string(),
  text: z.string(),
  textHash: z.string(),
  accepted: z.boolean(),
  acceptanceId: z.string().nullable(),
  acceptedAt: z.string().nullable(),
});
const errorSchema = z.object({ error: z.string(), code: z.string() });
export async function featureTermsRoutes(app: FastifyInstance) {
  const service = new FeatureTerms();
  for (const action of ["status", "accept", "access"] as const) {
    app.withTypeProvider<ZodTypeProvider>().route({
      method: action === "status" ? "GET" : "POST",
      url: `/me/feature-terms/:feature${action === "status" ? "" : `/${action}`}`,
      schema: {
        operationId:
          action === "status"
            ? "getFeatureTerms"
            : action === "accept"
              ? "acceptFeatureTerms"
              : "authorizeFeatureAccess",
        tags: ["Feature terms"],
        summary: `${action} authenticated feature acknowledgement`,
        params,
        ...(action === "accept"
          ? {
              body: z
                .object({
                  accepted: z.literal(true),
                  version: z.string().max(100),
                  textHash: z.string().regex(/^[a-f0-9]{64}$/),
                })
                .strict(),
            }
          : action === "access"
            ? {
                body: z
                  .object({ context: z.string().min(1).max(255) })
                  .strict(),
              }
            : {}),
        response: {
          200:
            action === "access"
              ? z.object({ authorized: z.literal(true), eventId: z.string() })
              : statusSchema,
          401: errorSchema,
          409: errorSchema,
          428: errorSchema,
        },
      },
      handler: async (request, reply) => {
        reply.header("Cache-Control", "no-store");
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session)
          return reply
            .status(401)
            .send({
              error: "Entre na sua conta para continuar.",
              code: "UNAUTHORIZED",
            });
        const feature = request.params.feature;
        try {
          if (action === "accept") {
            const body = request.body as { version: string; textHash: string };
            return reply.send(
              await service.accept({
                ...body,
                userId: session.user.id,
                feature,
                ipAddress: request.ip,
                userAgent: request.headers["user-agent"],
              }),
            );
          }
          if (action === "access") {
            const event = await service.authorize(
              session.user.id,
              feature,
              (request.body as { context: string }).context,
            );
            return reply.send({ authorized: true as const, eventId: event.id });
          }
          return reply.send(await service.status(session.user.id, feature));
        } catch (error) {
          if (error instanceof FeatureTermsError)
            return reply
              .code(error.statusCode)
              .send({ error: error.message, code: error.code });
          throw error;
        }
      },
    });
  }
}
