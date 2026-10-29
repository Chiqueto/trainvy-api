import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import z from "zod";

import { CoachAthleteError } from "../domain/coach-athlete.js";
import { auth } from "../lib/auth.js";
import { AdminError, requireAdmin } from "../lib/require-admin.js";
import { ErrorSchema } from "../schemas/index.js";
import {
  ProfessionalRegistrationSearch,
  ProfessionalVerificationPolicyResponse,
  RegistrationBody,
  RegistrationResponse,
  ReviewBody,
  UpdateProfessionalVerificationPolicyBody,
} from "../schemas/professional-verification.js";
import { ProfessionalVerification } from "../usecases/ProfessionalVerification.js";
import { ProfessionalVerificationPolicy } from "../usecases/ProfessionalVerificationPolicy.js";

export const professionalVerificationRoutes: FastifyPluginAsyncZod = async (
  app,
) => {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store");
  });
  const service = new ProfessionalVerification();
  const errors = {
    400: ErrorSchema,
    401: ErrorSchema,
    403: ErrorSchema,
    404: ErrorSchema,
    409: ErrorSchema,
    500: ErrorSchema,
  };
  app.setErrorHandler((e, req, reply) => {
    if (e instanceof AdminError || e instanceof CoachAthleteError)
      return reply.status(e.status).send({ code: e.code, error: e.message });
    if (
      (e && typeof e === "object" && "validation" in e) ||
      e instanceof z.ZodError
    )
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        error: "Revise os dados informados.",
      });
    req.log.error(e);
    return reply
      .status(500)
      .send({ code: "INTERNAL_SERVER_ERROR", error: "Erro interno." });
  });
  async function identity(headers: Parameters<typeof fromNodeHeaders>[0]) {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(headers),
    });
    if (!session) throw new CoachAthleteError("UNAUTHORIZED", 401);
    return session.user.id;
  }
  app.get(
    "/admin/professional-verification-policy",
    {
      schema: {
        operationId: "getProfessionalVerificationPolicy",
        tags: ["Admin"],
        response: { 200: ProfessionalVerificationPolicyResponse, ...errors },
      },
    },
    async (req) =>
      new ProfessionalVerificationPolicy().get(await requireAdmin(req)),
  );
  app.put(
    "/admin/professional-verification-policy",
    {
      schema: {
        operationId: "updateProfessionalVerificationPolicy",
        tags: ["Admin"],
        body: UpdateProfessionalVerificationPolicyBody,
        response: { 200: ProfessionalVerificationPolicyResponse, ...errors },
      },
    },
    async (req) =>
      new ProfessionalVerificationPolicy().update(
        await requireAdmin(req),
        req.body,
      ),
  );
  app.get(
    "/me/professional-registration",
    {
      schema: {
        operationId: "getProfessionalRegistration",
        tags: ["Professional verification"],
        response: { 200: RegistrationResponse.nullable(), ...errors },
      },
    },
    async (req) => service.get(await identity(req.headers)),
  );
  app.put(
    "/me/professional-registration",
    {
      schema: {
        operationId: "submitProfessionalRegistration",
        tags: ["Professional verification"],
        body: RegistrationBody,
        response: { 200: RegistrationResponse, ...errors },
      },
    },
    async (req) => service.submit(await identity(req.headers), req.body),
  );
  app.get(
    "/admin/professional-registrations",
    {
      schema: {
        operationId: "listProfessionalRegistrations",
        tags: ["Admin"],
        querystring: ProfessionalRegistrationSearch,
        response: { 200: z.array(RegistrationResponse), ...errors },
      },
    },
    async (req) => service.list(await requireAdmin(req), req.query),
  );
  app.get(
    "/admin/professional-registrations/:userId/reviews",
    {
      schema: {
        operationId: "listProfessionalVerificationReviews",
        tags: ["Admin"],
        params: z.object({ userId: z.string() }),
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              userId: z.string(),
              reviewerId: z.string(),
              revision: z.number(),
              result: z.string(),
              sourceUrl: z.string(),
              evidence: z.string(),
              identityMatched: z.boolean(),
              registrationActive: z.boolean(),
              scopeConfirmed: z.boolean(),
              checkedAt: z.string(),
              validUntil: z.string().nullable(),
              createdAt: z.string(),
              registrationSnapshot: z.unknown(),
            }),
          ),
          ...errors,
        },
      },
    },
    async (req) => service.reviews(await requireAdmin(req), req.params.userId),
  );
  app.post(
    "/admin/professional-registrations/:userId/review",
    {
      schema: {
        operationId: "reviewProfessionalRegistration",
        tags: ["Admin"],
        params: z.object({ userId: z.string() }),
        body: ReviewBody,
        response: { 200: RegistrationResponse, ...errors },
      },
    },
    async (req) =>
      service.review(await requireAdmin(req), req.params.userId, req.body),
  );
};
