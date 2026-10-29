import z from "zod";
import { createHash } from "node:crypto";
import { verifyImportPreview } from "../domain/workout-import.js";
import { ConfirmWorkoutImportBody } from "../schemas/planning-ai.js";
import { CreateWorkoutPlan } from "../usecases/CreateWorkoutPlan.js";
import { CoachAthleteError } from "../domain/coach-athlete.js";
import { AiRateLimitError } from "../errors/index.js";
import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { ConflictError, NotFoundError } from "../errors/index.js";
import { auth } from "../lib/auth.js";
import {
  ErrorSchema,
  PlanningOverviewResponseSchema,
} from "../schemas/index.js";
import {
  GenerateWorkoutPlanDraftWithAiBodySchema,
  GenerateWorkoutPlanDraftWithAiResponseSchema,
} from "../schemas/planning-ai.js";
import { GenerateAthleteWorkoutPlanDraftWithAi } from "../usecases/GenerateAthleteWorkoutPlanDraftWithAi.js";
import { GetPlanningOverview } from "../usecases/GetPlanningOverview.js";

export const planningRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/imports/confirm",
    {
      schema: {
        operationId: "confirmWorkoutImport",
        tags: ["Planning"],
        body: ConfirmWorkoutImportBody,
        response: {
          201: z.object({ id: z.string() }),
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (!session)
        return reply
          .status(401)
          .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
      try {
        const preview = verifyImportPreview(
          request.body.previewToken,
          session.user.id,
        );
        const result = await new CreateWorkoutPlan().execute({
          userId: session.user.id,
          name: request.body.name,
          activate: false,
          workoutDays: request.body.workoutDays,
          importPreviewHash: createHash("sha256")
            .update(request.body.previewToken)
            .digest("hex"),
          importProvenance: {
            sourceHash: preview.sourceHash,
            sourceType: preview.sourceType,
            extracted: preview.extracted,
            confirmedBy: session.user.id,
            confirmedAt: new Date().toISOString(),
            confirmedContent: {
              name: request.body.name,
              workoutDays: request.body.workoutDays,
            },
            professionalApproval: false,
          },
        });
        return reply.status(201).send({ id: result.id });
      } catch (e) {
        if (e instanceof CoachAthleteError)
          return reply
            .status(e.status)
            .send({ error: e.message, code: e.code });
        if (e instanceof ConflictError)
          return reply
            .status(409)
            .send({
              error: "Esta importação já foi confirmada.",
              code: "IMPORT_ALREADY_CONFIRMED",
            });
        request.log.error(e);
        return reply
          .status(500)
          .send({
            error: "Não foi possível salvar.",
            code: "INTERNAL_SERVER_ERROR",
          });
      }
    },
  );
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/overview",
    schema: {
      operationId: "getPlanningOverview",
      tags: ["Planning"],
      summary: "Get planning overview for authenticated user",
      response: {
        200: PlanningOverviewResponseSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        409: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const usecase = new GetPlanningOverview();
        const result = await usecase.execute({
          userId: session.user.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        if (error instanceof ConflictError) {
          return reply.status(409).send({
            error: error.message,
            code: error.code,
          });
        }
        app.log.error(error);
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });

  // 2. Generate Workout Plan Draft with AI (Text, Audio or Document/PDF)
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/ai-generate",
    schema: {
      operationId: "generateWorkoutPlanDraftWithAi",
      tags: ["Planning"],
      summary:
        "Extrair uma ficha fornecida sem prescrever ou preencher dados ausentes",
      body: GenerateWorkoutPlanDraftWithAiBodySchema,
      response: {
        200: GenerateWorkoutPlanDraftWithAiResponseSchema,
        400: ErrorSchema,
        403: ErrorSchema,
        429: ErrorSchema,
        404: ErrorSchema,
        409: ErrorSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const usecase = new GenerateAthleteWorkoutPlanDraftWithAi();
        const result = await usecase.execute({
          userId: session.user.id,
          prompt: request.body.prompt,
          fileUrl: request.body.fileUrl,
          mediaType: request.body.mediaType,
          filename: request.body.filename,
        });

        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof CoachAthleteError)
          return reply
            .status(error.status)
            .send({ error: error.message, code: error.code });
        if (error instanceof AiRateLimitError)
          return reply
            .status(429)
            .send({ error: error.message, code: error.code });
        app.log.error(error);
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });
};
