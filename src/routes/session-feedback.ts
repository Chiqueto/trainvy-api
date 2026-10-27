import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import z from "zod";
import { ConflictError, NotFoundError } from "../errors/index.js";
import { auth } from "../lib/auth.js";
import { ErrorSchema } from "../schemas/index.js";
import { SessionFeedbackBody, SessionFeedbackResponse } from "../schemas/session-feedback.js";
import { GetSessionFeedback, SaveSessionFeedback } from "../usecases/SessionFeedback.js";

export const sessionFeedbackRoutes: FastifyPluginAsyncZod = async app => {
  const params = z.object({ sessionId: z.uuid() });
  const errors = { 400: ErrorSchema, 401: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema, 500: ErrorSchema };
  app.get("/workout-sessions/:sessionId/feedback", { schema: {
    operationId: "getSessionFeedback", tags: ["Workout Session"], summary: "Get owned workout feedback",
    params, response: { 200: SessionFeedbackResponse.nullable(), ...errors },
  } }, async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
    try { return await new GetSessionFeedback().execute(session.user.id, request.params.sessionId); }
    catch (error) {
      if (error instanceof NotFoundError) return reply.status(404).send({ error: error.message, code: error.code });
      request.log.error(error);
      return reply.status(500).send({ error: "Falha ao carregar feedback.", code: "INTERNAL_ERROR" });
    }
  });
  app.put("/workout-sessions/:sessionId/feedback", { schema: {
    operationId: "saveSessionFeedback", tags: ["Workout Session"], summary: "Save or update feedback after completing an owned workout",
    params, body: SessionFeedbackBody, response: { 200: SessionFeedbackResponse, ...errors },
  } }, async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
    try { return await new SaveSessionFeedback().execute(session.user.id, request.params.sessionId, request.body); }
    catch (error) {
      if (error instanceof NotFoundError) return reply.status(404).send({ error: error.message, code: error.code });
      if (error instanceof ConflictError) return reply.status(409).send({ error: error.message, code: error.code });
      request.log.error(error);
      return reply.status(500).send({ error: "Falha ao salvar feedback.", code: "INTERNAL_ERROR" });
    }
  });
};
