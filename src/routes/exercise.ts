import { fromNodeHeaders } from "better-auth/node";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import z from "zod";

import { ConflictError, NotFoundError, ValidationError } from "../errors/index.js";
import { auth } from "../lib/auth.js";
import {
  CreateExerciseBodySchema,
  ErrorSchema,
  ExerciseCatalogVersionResponseSchema,
  ExerciseMediaParamsSchema,
  ExerciseMediaResponseSchema,
  ExerciseResponseSchema,
  ListExercisesQuerySchema,
  UpdateExerciseMusclesBodySchema,
  UpdateExerciseMusclesParamsSchema,
} from "../schemas/index.js";
import { CreateExercise } from "../usecases/CreateExercise.js";
import { GetExerciseCatalogVersion } from "../usecases/GetExerciseCatalogVersion.js";
import { GetExerciseMedia } from "../usecases/GetExerciseMedia.js";
import { ListExercises } from "../usecases/ListExercises.js";
import { UpdateExerciseMuscles } from "../usecases/UpdateExerciseMuscles.js";

export const exerciseRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /exercises/version — Retorna versão leve do catálogo para validação de cache
  app.route({
    method: "GET",
    url: "/version",
    schema: {
      operationId: "getExerciseCatalogVersion",
      tags: ["Exercise"],
      summary: "Get the current version and timestamp of the exercise catalog for caching",
      response: {
        200: ExerciseCatalogVersionResponseSchema,
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

        const getVersion = new GetExerciseCatalogVersion();
        const result = await getVersion.execute({ userId: session.user.id });
        reply.header("ETag", `"${result.version}"`);
        reply.header("Cache-Control", "private, no-cache");

        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });

  // GET /exercises
  app.route({
    method: "GET",
    url: "/",
    schema: {
      operationId: "listExercises",
      tags: ["Exercise"],
      summary: "List global exercises and user custom exercises with optional search query",
      querystring: ListExercisesQuerySchema,
      response: {
        200: z.array(ExerciseResponseSchema),
        304: z.null().describe("Not Modified"),
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

        const getVersion = new GetExerciseCatalogVersion();
        const versionResult = await getVersion.execute({ userId: session.user.id });
        const etag = `"${versionResult.version}"`;
        reply.header("ETag", etag);
        reply.header("Cache-Control", "private, no-cache");

        // Se o cliente já tem a versão mais recente em cache e não está filtrando por query
        if (
          !request.query.q &&
          !request.query.onlyWithHistory &&
          request.headers["if-none-match"] === etag
        ) {
          return reply.status(304).send();
        }

        const listExercises = new ListExercises();
        const result = await listExercises.execute({
          userId: session.user.id,
          query: request.query.q,
          onlyWithHistory: request.query.onlyWithHistory === "true",
        });

        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });

  // POST /exercises
  app.route({
    method: "POST",
    url: "/",
    schema: {
      operationId: "createExercise",
      tags: ["Exercise"],
      summary: "Create a custom exercise for the authenticated user",
      body: CreateExerciseBodySchema,
      response: {
        201: ExerciseResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
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

        const createExercise = new CreateExercise();
        const result = await createExercise.execute({
          userId: session.user.id,
          name: request.body.name,
          isUnilateral: request.body.isUnilateral,
          primaryMuscleGroups: request.body.primaryMuscleGroups,
          secondaryMuscleGroups: request.body.secondaryMuscleGroups,
        });

        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof ValidationError) {
          return reply.status(400).send({
            error: error.message,
            code: "VALIDATION_ERROR",
          });
        }

        if (error instanceof ConflictError) {
          return reply.status(409).send({
            error: error.message,
            code: "CONFLICT",
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

  // PUT /exercises/:id/muscles
  app.route({
    method: "PUT",
    url: "/:id/muscles",
    schema: {
      operationId: "updateExerciseMuscles",
      tags: ["Exercise"],
      summary: "Update muscle groups classification of a custom exercise",
      params: UpdateExerciseMusclesParamsSchema,
      body: UpdateExerciseMusclesBodySchema,
      response: {
        200: ExerciseResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
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

        const updateExerciseMuscles = new UpdateExerciseMuscles();
        const result = await updateExerciseMuscles.execute({
          userId: session.user.id,
          exerciseId: request.params.id,
          primaryMuscleGroups: request.body.primaryMuscleGroups,
          secondaryMuscleGroups: request.body.secondaryMuscleGroups,
        });

        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof ValidationError) {
          return reply.status(400).send({
            error: error.message,
            code: "VALIDATION_ERROR",
          });
        }

        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
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

  // GET /exercises/:exerciseId/media
  app.route({
    method: "GET",
    url: "/:exerciseId/media",
    schema: {
      operationId: "getExerciseMedia",
      tags: ["Exercise"],
      summary: "Get visual execution media and instructions for an exercise",
      params: ExerciseMediaParamsSchema,
      response: {
        200: ExerciseMediaResponseSchema,
        401: ErrorSchema,
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

        const getExerciseMedia = new GetExerciseMedia();
        const result = await getExerciseMedia.execute({
          userId: session.user.id,
          exerciseId: request.params.exerciseId,
        });

        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
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
