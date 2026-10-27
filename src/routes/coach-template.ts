import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  type FastifyPluginAsyncZod,
  hasZodFastifySchemaValidationErrors,
} from "fastify-type-provider-zod";
import z from "zod";

import { CoachAthleteError } from "../domain/coach-athlete.js";
import { CoachPrescriptionError } from "../domain/coach-prescription.js";
import { ValidationError } from "../errors/index.js";
import { auth } from "../lib/auth.js";
import {
  AllocateTemplateBodySchema,
  AllocateTemplateResponseSchema,
  CreateTemplateFromPlanBodySchema,
  CreateWorkoutPlanTemplateBodySchema,
  ListTemplatesResponseSchema,
  PlanIdParamsSchema,
  TemplateIdParamsSchema,
  TemplateItemResponseSchema,
  UpdateWorkoutPlanTemplateBodySchema,
} from "../schemas/coach-template.js";
import { ErrorSchema } from "../schemas/index.js";
import {
  AllocateWorkoutPlanTemplate,
  CreateWorkoutPlanTemplateFromPlan,
} from "../usecases/AllocateWorkoutPlanTemplate.js";
import { CreateWorkoutPlanTemplate } from "../usecases/CreateWorkoutPlanTemplate.js";
import { ListWorkoutPlanTemplates } from "../usecases/ListWorkoutPlanTemplates.js";
import {
  DeleteWorkoutPlanTemplate,
  GetWorkoutPlanTemplateDetails,
  UpdateWorkoutPlanTemplate,
} from "../usecases/ManageWorkoutPlanTemplate.js";

function fail(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (
    error instanceof CoachPrescriptionError ||
    error instanceof CoachAthleteError
  ) {
    return reply.status(error.status).send({
      error: error.message,
      code: error.code,
    });
  }

  if (error instanceof ValidationError) {
    return reply.status(400).send({
      error: error.message,
      code: "VALIDATION_ERROR",
    });
  }

  request.log.error(error);
  return reply.status(500).send({
    error: "Erro interno no processamento do modelo de treino.",
    code: "INTERNAL_SERVER_ERROR",
  });
}

const standardErrors = {
  400: ErrorSchema,
  401: ErrorSchema,
  403: ErrorSchema,
  404: ErrorSchema,
  500: ErrorSchema,
};

export const coachTemplateRoutes: FastifyPluginAsyncZod = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const issue = error.validation[0];
      return reply.status(400).send({
        error: `Revise ${issue?.instancePath || "o modelo"}: ${issue?.message ?? "valor inválido"}.`,
        code: "INVALID_TEMPLATE_PAYLOAD",
      });
    }
    return fail(error, request, reply);
  });

  // 1. Listar Modelos de Treino do Treinador
  app.get(
    "/coach/templates",
    {
      schema: {
        operationId: "listCoachWorkoutPlanTemplates",
        tags: ["Coach Templates"],
        summary: "Listar modelos de treino pré-definidos do treinador",
        response: {
          200: ListTemplatesResponseSchema,
          ...standardErrors,
        },
      },
    },
    async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session?.user) {
          return reply
            .status(401)
            .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new ListWorkoutPlanTemplates();
        const result = await useCase.execute({ coachId: session.user.id });
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 2. Criar Novo Modelo de Treino
  app.post(
    "/coach/templates",
    {
      schema: {
        operationId: "createCoachWorkoutPlanTemplate",
        tags: ["Coach Templates"],
        summary: "Criar modelo de treino pré-definido",
        body: CreateWorkoutPlanTemplateBodySchema,
        response: {
          201: TemplateItemResponseSchema,
          ...standardErrors,
        },
      },
    },
    async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session?.user) {
          return reply
            .status(401)
            .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new CreateWorkoutPlanTemplate();
        const result = await useCase.execute({
          coachId: session.user.id,
          name: request.body.name,
          description: request.body.description,
          workoutDays: request.body.workoutDays,
        });

        return reply.status(201).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 3. Obter Detalhes do Modelo
  app.get(
    "/coach/templates/:id",
    {
      schema: {
        operationId: "getCoachWorkoutPlanTemplate",
        tags: ["Coach Templates"],
        summary: "Obter detalhes de um modelo de treino",
        params: TemplateIdParamsSchema,
        response: {
          200: TemplateItemResponseSchema,
          ...standardErrors,
        },
      },
    },
    async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session?.user) {
          return reply
            .status(401)
            .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new GetWorkoutPlanTemplateDetails();
        const result = await useCase.execute({
          coachId: session.user.id,
          templateId: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 4. Atualizar Modelo de Treino
  app.put(
    "/coach/templates/:id",
    {
      schema: {
        operationId: "updateCoachWorkoutPlanTemplate",
        tags: ["Coach Templates"],
        summary: "Atualizar modelo de treino pré-definido",
        params: TemplateIdParamsSchema,
        body: UpdateWorkoutPlanTemplateBodySchema,
        response: {
          200: TemplateItemResponseSchema,
          ...standardErrors,
        },
      },
    },
    async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session?.user) {
          return reply
            .status(401)
            .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new UpdateWorkoutPlanTemplate();
        const result = await useCase.execute({
          coachId: session.user.id,
          templateId: request.params.id,
          name: request.body.name,
          description: request.body.description,
          workoutDays: request.body.workoutDays,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 5. Excluir Modelo de Treino
  app.delete(
    "/coach/templates/:id",
    {
      schema: {
        operationId: "deleteCoachWorkoutPlanTemplate",
        tags: ["Coach Templates"],
        summary: "Excluir modelo de treino pré-definido",
        params: TemplateIdParamsSchema,
        response: {
          200: z.object({ success: z.boolean() }),
          ...standardErrors,
        },
      },
    },
    async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session?.user) {
          return reply
            .status(401)
            .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new DeleteWorkoutPlanTemplate();
        const result = await useCase.execute({
          coachId: session.user.id,
          templateId: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 6. Alocar Modelo para Aluno (Cria e envia prescrição imediatamente)
  app.post(
    "/coach/templates/:id/allocate",
    {
      schema: {
        operationId: "allocateCoachWorkoutPlanTemplate",
        tags: ["Coach Templates"],
        summary: "Alocar modelo pré-definido para um aluno como prescrição",
        params: TemplateIdParamsSchema,
        body: AllocateTemplateBodySchema,
        response: {
          200: AllocateTemplateResponseSchema,
          ...standardErrors,
        },
      },
    },
    async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session?.user) {
          return reply
            .status(401)
            .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new AllocateWorkoutPlanTemplate();
        const result = await useCase.execute({
          coachId: session.user.id,
          templateId: request.params.id,
          athleteId: request.body.athleteId,
          notes: request.body.notes,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 7. Salvar Plano Pessoal como Modelo Pré-definido
  app.post(
    "/coach/templates/from-plan/:planId",
    {
      schema: {
        operationId: "createCoachWorkoutPlanTemplateFromPlan",
        tags: ["Coach Templates"],
        summary: "Salvar um plano de treino existente como modelo pré-definido",
        params: PlanIdParamsSchema,
        body: CreateTemplateFromPlanBodySchema,
        response: {
          201: TemplateItemResponseSchema,
          ...standardErrors,
        },
      },
    },
    async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session?.user) {
          return reply
            .status(401)
            .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new CreateWorkoutPlanTemplateFromPlan();
        const result = await useCase.execute({
          coachId: session.user.id,
          planId: request.params.planId,
          name: request.body.name,
          description: request.body.description,
        });

        return reply.status(201).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );
};
