import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { auth } from "../lib/auth.js";
import {
  CreateFeedbackBodySchema,
  CreateFeedbackResponseSchema,
  ErrorSchema,
} from "../schemas/index.js";
import { CreateFeedback } from "../usecases/CreateFeedback.js";

export const feedbackRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
      tags: ["Feedback"],
      summary: "Submit beta feedback (Trainvy)",
      body: CreateFeedbackBodySchema,
      response: {
        201: CreateFeedbackResponseSchema,
        400: ErrorSchema,
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

      const { category, message } = request.body;

      try {
        const createFeedback = new CreateFeedback();
        const result = await createFeedback.execute({
          userId: session.user.id,
          category,
          message,
        });

        return reply.status(201).send({
          success: true,
          id: result.id,
        });
      } catch (err) {
        return reply.status(400).send({
          error:
            err instanceof Error
              ? err.message
              : "Erro ao registrar feedback.",
          code: "FEEDBACK_ERROR",
        });
      }
    },
  });
};
