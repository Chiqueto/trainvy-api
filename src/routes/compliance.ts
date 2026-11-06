import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import z from "zod";

import { CoachAthleteError } from "../domain/coach-athlete.js";
import { auth } from "../lib/auth.js";
import { AdminError, requireAdmin } from "../lib/require-admin.js";
import { PrescriptionPayloadSchema } from "../schemas/coach-prescription.js";
import {
  AcceptanceBody,
  ComplianceOverviewSchema,
  DeclarationBody,
  DocumentSchema,
  EditDocumentBody,
  ReviewExerciseBody,
} from "../schemas/compliance.js";
import { LegalCompliance } from "../usecases/LegalCompliance.js";
import { PrivacyRights } from "../usecases/PrivacyRights.js";

export const complianceRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = new LegalCompliance();
  const error = z.object({ code: z.string(), error: z.string() });
  const errors = {
    400: error,
    401: error,
    403: error,
    404: error,
    409: error,
    500: error,
  };
  const success = z.object({ success: z.literal(true) });
  const params = z.object({ id: z.string().max(128) });
  app.addHook("onRequest", async (_, reply) => {
    reply.header("Cache-Control", "private, no-store");
  });
  app.setErrorHandler((e, request, reply) => {
    if (e instanceof CoachAthleteError || e instanceof AdminError)
      return reply.code(e.status).send({ code: e.code, error: e.message });
    if (
      e instanceof z.ZodError ||
      (e && typeof e === "object" && "validation" in e)
    )
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        error: "Revise os dados informados.",
      });
    request.log.error(e);
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      error: "Não foi possível concluir a operação.",
    });
  });
  async function identity(headers: Parameters<typeof fromNodeHeaders>[0]) {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(headers),
    });
    if (!session) throw new CoachAthleteError("UNAUTHORIZED", 401);
    return session.user.id;
  }
  app.get(
    "/coach/prescriptions/archive",
    {
      schema: {
        operationId: "getMyArchivedPrescriptions",
        tags: ["Coach"],
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              athleteId: z.string(),
              name: z.string(),
              notes: z.string().nullable(),
              approvedAt: z.string(),
              prescribedCrefSnapshot: z.string().nullable(),
              payload: PrescriptionPayloadSchema,
            }),
          ),
          ...errors,
        },
      },
    },
    async (req) => service.archivedPrescriptions(await identity(req.headers)),
  );
  app.post(
    "/workout-plans/:id/approve",
    {
      schema: {
        operationId: "approveAiWorkoutPlan",
        tags: ["Legal"],
        params,
        body: z.strictObject({
          reviewed: z.literal(true),
          expectedUpdatedAt: z.iso.datetime(),
        }),
        response: { 200: success, ...errors },
      },
    },
    async (req) =>
      service.approvePlan(
        await identity(req.headers),
        req.params.id,
        req.body.expectedUpdatedAt,
      ),
  );
  app.get(
    "/me/privacy/export",
    {
      schema: {
        operationId: "exportMyData",
        tags: ["Privacy"],
        response: { 200: z.object({ json: z.string() }), ...errors },
      },
    },
    async (req) => ({
      json: await new PrivacyRights().export(await identity(req.headers)),
    }),
  );
  app.post(
    "/me/privacy/revoke-health",
    {
      schema: {
        operationId: "revokeHealthConsent",
        tags: ["Privacy"],
        response: { 200: success, ...errors },
      },
    },
    async (req) =>
      new PrivacyRights().revokeHealth(await identity(req.headers)),
  );
  app.delete(
    "/me/privacy/account",
    {
      schema: {
        operationId: "eraseMyAccount",
        tags: ["Privacy"],
        body: z.strictObject({
          confirmation: z.literal("EXCLUIR MINHA CONTA"),
        }),
        response: { 200: success, ...errors },
      },
    },
    async (req) =>
      new PrivacyRights().erase(
        await identity(req.headers),
        req.body.confirmation,
      ),
  );
  app.get(
    "/legal/documents",
    {
      schema: {
        operationId: "listLegalDocuments",
        tags: ["Legal"],
        response: { 200: z.array(DocumentSchema), ...errors },
      },
    },
    async () => service.documents(),
  );
  app.get(
    "/me/legal-documents",
    {
      schema: {
        operationId: "getMyLegalDocuments",
        tags: ["Legal"],
        response: { 200: z.array(DocumentSchema), ...errors },
      },
    },
    async (req) => service.documents(await identity(req.headers)),
  );
  app.post(
    "/me/legal-documents/:id/accept",
    {
      schema: {
        operationId: "acceptLegalDocument",
        tags: ["Legal"],
        params,
        body: AcceptanceBody,
        response: { 200: success, ...errors },
      },
    },
    async (req) =>
      service.accept(await identity(req.headers), req.params.id, req.body, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      }),
  );
  app.post(
    "/me/professional-declaration",
    {
      schema: {
        operationId: "declareProfessionalCredentials",
        tags: ["Legal"],
        body: DeclarationBody,
        response: { 200: success, ...errors },
      },
    },
    async (req) =>
      service.declare(await identity(req.headers), req.body, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      }),
  );
  app.get(
    "/admin/compliance",
    {
      schema: {
        operationId: "getAdminCompliance",
        tags: ["Admin"],
        querystring: z.object({
          q: z.string().max(180).optional(),
          cursor: z.uuid().optional(),
        }),
        response: { 200: ComplianceOverviewSchema, ...errors },
      },
    },
    async (req) =>
      service.overview(await requireAdmin(req), req.query.q, req.query.cursor),
  );
  app.put(
    "/admin/compliance/documents/:id",
    {
      schema: {
        operationId: "editLegalDocument",
        tags: ["Admin"],
        params,
        body: EditDocumentBody,
        response: { 200: success, ...errors },
      },
    },
    async (req) =>
      service.editDocument(await requireAdmin(req), req.params.id, req.body),
  );
  app.patch(
    "/admin/compliance/items/:id",
    {
      schema: {
        operationId: "updateComplianceItem",
        tags: ["Admin"],
        params,
        body: z.strictObject({
          implementationStatus: z.enum(["IMPLEMENTED", "PARTIAL", "PENDING"]),
        }),
        response: { 200: success, ...errors },
      },
    },
    async (req) =>
      service.updateItem(
        await requireAdmin(req),
        req.params.id,
        req.body.implementationStatus,
      ),
  );
  app.post(
    "/admin/compliance/professionals/:id",
    {
      schema: {
        operationId: "auditComplianceProfessional",
        tags: ["Admin"],
        params,
        body: z.strictObject({
          status: z.enum(["VERIFIED_ADMIN", "SUSPENDED_FRAUD"]),
        }),
        response: { 200: success, ...errors },
      },
    },
    async (req) =>
      service.professional(
        await requireAdmin(req),
        req.params.id,
        req.body.status,
      ),
  );
  app.post(
    "/admin/compliance/exercises/:id",
    {
      schema: {
        operationId: "reviewComplianceExercise",
        tags: ["Admin"],
        params,
        body: ReviewExerciseBody,
        response: { 200: success, ...errors },
      },
    },
    async (req) =>
      service.reviewExercise(await requireAdmin(req), req.params.id, req.body),
  );
};
