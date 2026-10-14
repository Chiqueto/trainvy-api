import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { CoachAthleteError } from "../domain/coach-athlete.js";
import { CoachPrescriptionError } from "../domain/coach-prescription.js";
import { auth } from "../lib/auth.js";
import {
  AcceptPrescriptionResponseSchema,
  CoachAthletePrescriptionsParamsSchema,
  CreatePrescriptionDraftBodySchema,
  ErrorSchema,
  ListPrescriptionsResponseSchema,
  PrescriptionIdParamsSchema,
  PrescriptionItemResponseSchema,
  UpdatePrescriptionDraftBodySchema,
} from "../schemas/index.js";
import { AcceptWorkoutPrescription } from "../usecases/AcceptWorkoutPrescription.js";
import { CancelWorkoutPrescription } from "../usecases/CancelWorkoutPrescription.js";
import { CreateWorkoutPrescriptionDraft } from "../usecases/CreateWorkoutPrescriptionDraft.js";
import { DeclineWorkoutPrescription } from "../usecases/DeclineWorkoutPrescription.js";
import { GetWorkoutPrescriptionDetails } from "../usecases/GetWorkoutPrescriptionDetails.js";
import { ListAthletePrescriptions } from "../usecases/ListAthletePrescriptions.js";
import { ListCoachPrescriptions } from "../usecases/ListCoachPrescriptions.js";
import { SendWorkoutPrescription } from "../usecases/SendWorkoutPrescription.js";
import { UpdateWorkoutPrescriptionDraft } from "../usecases/UpdateWorkoutPrescriptionDraft.js";

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

  if (typeof error === "object" && error !== null && "code" in error) {
    const prismaCode = (error as { code: string }).code;
    if (prismaCode === "P2002") {
      return reply.status(409).send({
        error: "Conflito de unicidade ao processar a prescrição.",
        code: "UNIQUE_CONSTRAINT_VIOLATION",
      });
    }
    if (prismaCode === "P2034") {
      return reply.status(409).send({
        error: "Conflito de concorrência. Por favor, tente novamente.",
        code: "CONCURRENCY_CONFLICT",
      });
    }
  }

  request.log.error(error);
  return reply.status(500).send({
    error: "Erro interno no processamento da prescrição.",
    code: "INTERNAL_SERVER_ERROR",
  });
}

const standardErrors = {
  400: ErrorSchema,
  401: ErrorSchema,
  403: ErrorSchema,
  404: ErrorSchema,
  409: ErrorSchema,
  500: ErrorSchema,
};

export const coachPrescriptionRoutes: FastifyPluginAsyncZod = async (app) => {
  // 1. Criar Rascunho de Prescrição (Coach)
  app.post(
    "/coach/prescriptions",
    {
      schema: {
        operationId: "createWorkoutPrescriptionDraft",
        tags: ["Coach"],
        summary: "Criar rascunho de prescrição de treino para um aluno",
        body: CreatePrescriptionDraftBodySchema,
        response: {
          201: PrescriptionItemResponseSchema,
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

        const useCase = new CreateWorkoutPrescriptionDraft();
        const result = await useCase.execute({
          coachId: session.user.id,
          athleteId: request.body.athleteId,
          name: request.body.name,
          notes: request.body.notes,
          workoutDays: request.body.workoutDays,
        });

        return reply.status(201).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 2. Atualizar Rascunho de Prescrição (Coach)
  app.put(
    "/coach/prescriptions/:id",
    {
      schema: {
        operationId: "updateWorkoutPrescriptionDraft",
        tags: ["Coach"],
        summary: "Atualizar rascunho de prescrição existente antes do envio",
        params: PrescriptionIdParamsSchema,
        body: UpdatePrescriptionDraftBodySchema,
        response: {
          200: PrescriptionItemResponseSchema,
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

        const useCase = new UpdateWorkoutPrescriptionDraft();
        const result = await useCase.execute({
          coachId: session.user.id,
          prescriptionId: request.params.id,
          name: request.body.name,
          notes: request.body.notes,
          workoutDays: request.body.workoutDays,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 3. Enviar Prescrição ao Aluno (Coach)
  app.post(
    "/coach/prescriptions/:id/send",
    {
      schema: {
        operationId: "sendWorkoutPrescription",
        tags: ["Coach"],
        summary: "Enviar prescrição em rascunho para o aluno",
        params: PrescriptionIdParamsSchema,
        response: {
          200: PrescriptionItemResponseSchema,
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

        const useCase = new SendWorkoutPrescription();
        const result = await useCase.execute({
          coachId: session.user.id,
          prescriptionId: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 4. Cancelar Prescrição (Coach)
  app.post(
    "/coach/prescriptions/:id/cancel",
    {
      schema: {
        operationId: "cancelWorkoutPrescription",
        tags: ["Coach"],
        summary: "Cancelar prescrição pendente ou em rascunho",
        params: PrescriptionIdParamsSchema,
        response: {
          200: PrescriptionItemResponseSchema,
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

        const useCase = new CancelWorkoutPrescription();
        const result = await useCase.execute({
          coachId: session.user.id,
          prescriptionId: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 5. Listar Prescrições de um Aluno Específico (Coach)
  app.get(
    "/coach/athletes/:athleteId/prescriptions",
    {
      schema: {
        operationId: "listCoachAthletePrescriptions",
        tags: ["Coach"],
        summary: "Listar prescrições elaboradas pelo treinador para um aluno",
        params: CoachAthletePrescriptionsParamsSchema,
        response: {
          200: ListPrescriptionsResponseSchema,
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

        const useCase = new ListCoachPrescriptions();
        const result = await useCase.execute({
          coachId: session.user.id,
          athleteId: request.params.athleteId,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 6. Consultar Detalhes da Prescrição pelo Coach (Coach)
  app.get(
    "/coach/prescriptions/:id",
    {
      schema: {
        operationId: "getCoachPrescriptionDetails",
        tags: ["Coach"],
        summary: "Consultar detalhes completos de uma prescrição criada pelo treinador",
        params: PrescriptionIdParamsSchema,
        response: {
          200: PrescriptionItemResponseSchema,
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

        const useCase = new GetWorkoutPrescriptionDetails();
        const result = await useCase.execute({
          userId: session.user.id,
          prescriptionId: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 7. Listar Prescrições Recebidas pelo Atleta (Atleta)
  app.get(
    "/me/prescriptions",
    {
      schema: {
        operationId: "listAthletePrescriptions",
        tags: ["Me"],
        summary: "Listar prescrições de treino recebidas pelo atleta",
        response: {
          200: ListPrescriptionsResponseSchema,
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

        const useCase = new ListAthletePrescriptions();
        const result = await useCase.execute({
          athleteId: session.user.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 8. Consultar Detalhes da Prescrição Recebida pelo Atleta (Atleta)
  app.get(
    "/me/prescriptions/:id",
    {
      schema: {
        operationId: "getAthletePrescriptionDetails",
        tags: ["Me"],
        summary: "Consultar detalhes da prescrição recebida pelo atleta",
        params: PrescriptionIdParamsSchema,
        response: {
          200: PrescriptionItemResponseSchema,
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

        const useCase = new GetWorkoutPrescriptionDetails();
        const result = await useCase.execute({
          userId: session.user.id,
          prescriptionId: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 9. Aceitar Prescrição e Criar Planejamento Inativo (Atleta)
  app.post(
    "/me/prescriptions/:id/accept",
    {
      schema: {
        operationId: "acceptWorkoutPrescription",
        tags: ["Me"],
        summary: "Aceitar prescrição de treino e gerar planejamento próprio inativo",
        params: PrescriptionIdParamsSchema,
        response: {
          200: AcceptPrescriptionResponseSchema,
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

        const useCase = new AcceptWorkoutPrescription();
        const result = await useCase.execute({
          athleteId: session.user.id,
          prescriptionId: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 10. Recusar Prescrição (Atleta)
  app.post(
    "/me/prescriptions/:id/decline",
    {
      schema: {
        operationId: "declineWorkoutPrescription",
        tags: ["Me"],
        summary: "Recusar prescrição de treino recebida",
        params: PrescriptionIdParamsSchema,
        response: {
          200: PrescriptionItemResponseSchema,
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

        const useCase = new DeclineWorkoutPrescription();
        const result = await useCase.execute({
          athleteId: session.user.id,
          prescriptionId: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );
};
