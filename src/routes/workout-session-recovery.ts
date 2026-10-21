import { fromNodeHeaders } from "better-auth/node";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InvalidDateRangeError,
  InvalidTimezoneError,
  NotFoundError,
} from "../errors/index.js";
import { auth } from "../lib/auth.js";
import {
  ConfirmForgottenWorkoutRecoveryBodySchema,
  ConfirmForgottenWorkoutRecoveryParamsSchema,
  ConfirmForgottenWorkoutRecoveryResponseSchema,
  CreateForgottenWorkoutDraftBodySchema,
  DiscardForgottenWorkoutDraftBodySchema,
  DiscardForgottenWorkoutDraftParamsSchema,
  DiscardForgottenWorkoutDraftResponseSchema,
  ErrorSchema,
  ForgottenWorkoutDraftSchema,
  GetForgottenWorkoutDraftParamsSchema,
  GetForgottenWorkoutDraftResponseSchema,
  ListActiveForgottenWorkoutDraftsQuerySchema,
  ListActiveForgottenWorkoutDraftsResponseSchema,
  UpdateForgottenWorkoutDraftBodySchema,
  UpdateForgottenWorkoutDraftParamsSchema,
} from "../schemas/index.js";
import { ConfirmForgottenWorkoutRecovery } from "../usecases/ConfirmForgottenWorkoutRecovery.js";
import { CreateForgottenWorkoutDraft } from "../usecases/CreateForgottenWorkoutDraft.js";
import { DiscardForgottenWorkoutDraft } from "../usecases/DiscardForgottenWorkoutDraft.js";
import { GetForgottenWorkoutDraft } from "../usecases/GetForgottenWorkoutDraft.js";
import { ListActiveForgottenWorkoutDrafts } from "../usecases/ListActiveForgottenWorkoutDrafts.js";
import { UpdateForgottenWorkoutDraft } from "../usecases/UpdateForgottenWorkoutDraft.js";

export const workoutSessionRecoveryRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /workout-sessions/recovery/drafts
  app.route({
    method: "POST",
    url: "/workout-sessions/recovery/drafts",
    schema: {
      operationId: "createForgottenWorkoutDraft",
      tags: ["Workout Recovery"],
      summary: "Create a draft for recovering a forgotten past workout session",
      body: CreateForgottenWorkoutDraftBodySchema,
      response: {
        201: ForgottenWorkoutDraftSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
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

        const createDraft = new CreateForgottenWorkoutDraft();
        const result = await createDraft.execute({
          userId: session.user.id,
          ...request.body,
        });

        return reply.status(201).send(result);
      } catch (error: any) {
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        if (error instanceof ForbiddenError) {
          return reply.status(403).send({
            error: error.message,
            code: "FORBIDDEN",
          });
        }
        if (error instanceof BadRequestError || error instanceof InvalidDateRangeError || error instanceof InvalidTimezoneError) {
          return reply.status(400).send({
            error: error.message,
            code: "BAD_REQUEST",
          });
        }
        if (error instanceof ConflictError) {
          return reply.status(409).send({
            error: error.message,
            code: error.code || "CONFLICT",
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

  // GET /workout-sessions/recovery/drafts
  app.route({
    method: "GET",
    url: "/workout-sessions/recovery/drafts",
    schema: {
      operationId: "listActiveForgottenWorkoutDrafts",
      tags: ["Workout Recovery"],
      summary: "List active pending recovery drafts for user or conversation",
      querystring: ListActiveForgottenWorkoutDraftsQuerySchema,
      response: {
        200: ListActiveForgottenWorkoutDraftsResponseSchema,
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

        const listDrafts = new ListActiveForgottenWorkoutDrafts();
        const result = await listDrafts.execute({
          userId: session.user.id,
          conversationId: request.query.conversationId,
        });

        return reply.status(200).send(result);
      } catch (error: any) {
        app.log.error(error);
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });

  // GET /workout-sessions/recovery/drafts/:draftId
  app.route({
    method: "GET",
    url: "/workout-sessions/recovery/drafts/:draftId",
    schema: {
      operationId: "getForgottenWorkoutDraft",
      tags: ["Workout Recovery"],
      summary: "Get recovery draft details with current conflict status",
      params: GetForgottenWorkoutDraftParamsSchema,
      response: {
        200: GetForgottenWorkoutDraftResponseSchema,
        401: ErrorSchema,
        403: ErrorSchema,
        404: ErrorSchema,
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

        const getDraft = new GetForgottenWorkoutDraft();
        const result = await getDraft.execute({
          userId: session.user.id,
          draftId: request.params.draftId,
        });

        return reply.status(200).send(result);
      } catch (error: any) {
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        if (error instanceof ForbiddenError) {
          return reply.status(403).send({
            error: error.message,
            code: "FORBIDDEN",
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

  // PATCH /workout-sessions/recovery/drafts/:draftId
  app.route({
    method: "PATCH",
    url: "/workout-sessions/recovery/drafts/:draftId",
    schema: {
      operationId: "updateForgottenWorkoutDraft",
      tags: ["Workout Recovery"],
      summary: "Edit details, exercises or sets of a forgotten workout draft",
      params: UpdateForgottenWorkoutDraftParamsSchema,
      body: UpdateForgottenWorkoutDraftBodySchema,
      response: {
        200: ForgottenWorkoutDraftSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
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

        const updateDraft = new UpdateForgottenWorkoutDraft();
        const result = await updateDraft.execute({
          userId: session.user.id,
          draftId: request.params.draftId,
          ...request.body,
        });

        return reply.status(200).send(result);
      } catch (error: any) {
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        if (error instanceof ForbiddenError) {
          return reply.status(403).send({
            error: error.message,
            code: "FORBIDDEN",
          });
        }
        if (error instanceof ConflictError) {
          return reply.status(409).send({
            error: error.message,
            code: error.code || "CONFLICT",
          });
        }
        if (error instanceof BadRequestError || error instanceof InvalidDateRangeError || error instanceof InvalidTimezoneError) {
          return reply.status(400).send({
            error: error.message,
            code: "BAD_REQUEST",
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

  // POST /workout-sessions/recovery/drafts/:draftId/discard
  app.route({
    method: "POST",
    url: "/workout-sessions/recovery/drafts/:draftId/discard",
    schema: {
      operationId: "discardForgottenWorkoutDraft",
      tags: ["Workout Recovery"],
      summary: "Discard a pending recovery draft",
      params: DiscardForgottenWorkoutDraftParamsSchema,
      body: DiscardForgottenWorkoutDraftBodySchema,
      response: {
        200: DiscardForgottenWorkoutDraftResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
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

        const discardDraft = new DiscardForgottenWorkoutDraft();
        const draft = await discardDraft.execute({
          userId: session.user.id,
          draftId: request.params.draftId,
        });

        return reply.status(200).send({
          success: true,
          draft,
        });
      } catch (error: any) {
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        if (error instanceof ForbiddenError) {
          return reply.status(403).send({
            error: error.message,
            code: "FORBIDDEN",
          });
        }
        if (error instanceof ConflictError) {
          return reply.status(409).send({
            error: error.message,
            code: error.code || "CONFLICT",
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

  // POST /workout-sessions/recovery/drafts/:draftId/confirm
  app.route({
    method: "POST",
    url: "/workout-sessions/recovery/drafts/:draftId/confirm",
    schema: {
      operationId: "confirmForgottenWorkoutRecovery",
      tags: ["Workout Recovery"],
      summary: "Confirm recovery draft, creating retroactive WorkoutSession atomically",
      params: ConfirmForgottenWorkoutRecoveryParamsSchema,
      body: ConfirmForgottenWorkoutRecoveryBodySchema,
      response: {
        200: ConfirmForgottenWorkoutRecoveryResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
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

        const confirmRecovery = new ConfirmForgottenWorkoutRecovery();
        const result = await confirmRecovery.execute({
          userId: session.user.id,
          draftId: request.params.draftId,
          clientRevision: request.body.clientRevision,
          idempotencyKey: request.body.idempotencyKey,
          confirmConflict: request.body.confirmConflict,
        });

        return reply.status(200).send(result);
      } catch (error: any) {
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        if (error instanceof ForbiddenError) {
          return reply.status(403).send({
            error: error.message,
            code: "FORBIDDEN",
          });
        }
        if (error instanceof ConflictError) {
          return reply.status(409).send({
            error: error.message,
            code: error.code || "CONFLICT",
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
};
