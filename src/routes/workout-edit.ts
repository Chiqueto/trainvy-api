import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import z from "zod";

import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../errors/index.js";
import { auth } from "../lib/auth.js";
import { ErrorSchema } from "../schemas/index.js";
import {
  EditableWorkoutPlanResponse,
  UpdateWorkoutPlanBody,
} from "../schemas/workout-edit.js";
import {
  EditWorkoutPlan,
  GetEditableWorkoutPlan,
} from "../usecases/EditWorkoutPlan.js";

export const workoutEditRoutes: FastifyPluginAsyncZod = async (app) => {
  const params = z.object({ id: z.uuid() });
  const errors = {
    400: ErrorSchema,
    401: ErrorSchema,
    404: ErrorSchema,
    409: ErrorSchema,
    500: ErrorSchema,
  };
  app.get(
    "/workout-plans/:id/edit",
    {
      schema: {
        operationId: "getEditableWorkoutPlan",
        tags: ["Workout Plan"],
        summary: "Get owned plan with editable days and exercises",
        params,
        response: { 200: EditableWorkoutPlanResponse, ...errors },
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
        return await new GetEditableWorkoutPlan().execute(
          session.user.id,
          request.params.id,
        );
      } catch (error) {
        if (error instanceof NotFoundError)
          return reply
            .status(404)
            .send({ error: error.message, code: error.code });
        request.log.error(error);
        return reply
          .status(500)
          .send({
            error: "Não foi possível carregar o plano.",
            code: "INTERNAL_ERROR",
          });
      }
    },
  );
  app.put(
    "/workout-plans/:id",
    {
      schema: {
        operationId: "editWorkoutPlan",
        tags: ["Workout Plan"],
        summary:
          "Edit owned plan without changing session snapshots or activation",
        params,
        body: UpdateWorkoutPlanBody,
        response: {
          200: z.object({ id: z.uuid(), success: z.boolean() }),
          ...errors,
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
        return await new EditWorkoutPlan().execute(
          session.user.id,
          request.params.id,
          request.body,
        );
      } catch (error) {
        if (error instanceof NotFoundError)
          return reply
            .status(404)
            .send({ error: error.message, code: error.code });
        if (error instanceof ConflictError)
          return reply
            .status(409)
            .send({ error: error.message, code: error.code });
        if (
          error instanceof BadRequestError ||
          error instanceof ValidationError ||
          error instanceof z.ZodError
        ) {
          return reply
            .status(400)
            .send({ error: error.message, code: "VALIDATION_ERROR" });
        }
        request.log.error(error);
        return reply
          .status(500)
          .send({
            error: "Não foi possível salvar o plano.",
            code: "INTERNAL_ERROR",
          });
      }
    },
  );
};
