import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { CoachAthleteError } from "../domain/coach-athlete.js";
import { auth } from "../lib/auth.js";
import {
  AcceptCoachInvitationBodySchema,
  AcceptCoachInvitationResponseSchema,
  CancelCoachInvitationParamsSchema,
  CreateCoachInvitationBodySchema,
  CreateCoachInvitationResponseSchema,
  GetAthleteCoachRelationshipResponseSchema,
  GetInvitationPreviewParamsSchema,
  GetInvitationPreviewResponseSchema,
  ListCoachAthletesResponseSchema,
  ListCoachInvitationsResponseSchema,
  RevokeCoachAthleteParamsSchema,
  SuccessResponseSchema,
} from "../schemas/coach.js";
import { ErrorSchema } from "../schemas/index.js";
import { AcceptCoachInvitation } from "../usecases/AcceptCoachInvitation.js";
import { CancelCoachInvitation } from "../usecases/CancelCoachInvitation.js";
import { CreateCoachInvitation } from "../usecases/CreateCoachInvitation.js";
import { GetAthleteCoachRelationship } from "../usecases/GetAthleteCoachRelationship.js";
import { GetInvitationPreview } from "../usecases/GetInvitationPreview.js";
import { ListCoachAthletes } from "../usecases/ListCoachAthletes.js";
import { ListCoachInvitations } from "../usecases/ListCoachInvitations.js";
import { RevokeCoachAthleteLink } from "../usecases/RevokeCoachAthleteLink.js";

function fail(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof CoachAthleteError) {
    return reply.status(error.status).send({
      error: error.message,
      code: error.code,
    });
  }

  // Intercepta erros conhecidos do Prisma (ex: P2002 Unique, P2034 Serialization/Write conflict)
  if (typeof error === "object" && error !== null && "code" in error) {
    const prismaCode = (error as { code: string }).code;
    if (prismaCode === "P2002") {
      return reply.status(409).send({
        error: "Conflito de unicidade ao processar o relacionamento.",
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
    error: "Erro interno no processamento do relacionamento.",
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

export const coachRoutes: FastifyPluginAsyncZod = async (app) => {
  // 1. Criar convite para novo aluno (Coach)
  app.post(
    "/coach/invitations",
    {
      schema: {
        operationId: "createCoachInvitation",
        tags: ["Coach"],
        summary: "Criar convite seguro para novo aluno",
        body: CreateCoachInvitationBodySchema,
        response: {
          201: CreateCoachInvitationResponseSchema,
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
          return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new CreateCoachInvitation();
        const result = await useCase.execute({
          coachId: session.user.id,
          expiresInDays: request.body?.expiresInDays,
        });

        return reply.status(201).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 2. Listar convites emitidos (Coach)
  app.get(
    "/coach/invitations",
    {
      schema: {
        operationId: "listCoachInvitations",
        tags: ["Coach"],
        summary: "Listar convites emitidos pelo treinador",
        response: {
          200: ListCoachInvitationsResponseSchema,
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
          return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new ListCoachInvitations();
        const result = await useCase.execute({ coachId: session.user.id });
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 3. Cancelar convite emitido (Coach)
  app.delete(
    "/coach/invitations/:id",
    {
      schema: {
        operationId: "cancelCoachInvitation",
        tags: ["Coach"],
        summary: "Cancelar convite emitido",
        params: CancelCoachInvitationParamsSchema,
        response: {
          200: SuccessResponseSchema,
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
          return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new CancelCoachInvitation();
        const result = await useCase.execute({
          coachId: session.user.id,
          invitationId: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 4. Listar alunos ativos vinculados (Coach)
  app.get(
    "/coach/athletes",
    {
      schema: {
        operationId: "listCoachAthletes",
        tags: ["Coach"],
        summary: "Listar alunos ativos vinculados ao treinador",
        response: {
          200: ListCoachAthletesResponseSchema,
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
          return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new ListCoachAthletes();
        const result = await useCase.execute({ coachId: session.user.id });
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 5. Encerrar vínculo com aluno (Coach)
  app.delete(
    "/coach/athletes/:linkId",
    {
      schema: {
        operationId: "revokeCoachAthleteLink",
        tags: ["Coach"],
        summary: "Encerrar vínculo com aluno",
        params: RevokeCoachAthleteParamsSchema,
        response: {
          200: SuccessResponseSchema,
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
          return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new RevokeCoachAthleteLink();
        const result = await useCase.execute({
          userId: session.user.id,
          linkId: request.params.linkId,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 6. Preview do convite (Público / Atleta)
  app.get(
    "/coach/invitations/preview/:token",
    {
      schema: {
        operationId: "getInvitationPreview",
        tags: ["Coach"],
        summary: "Consultar preview seguro de convite de treinador",
        params: GetInvitationPreviewParamsSchema,
        response: {
          200: GetInvitationPreviewResponseSchema,
          ...standardErrors,
        },
      },
    },
    async (request, reply) => {
      try {
        const useCase = new GetInvitationPreview();
        const result = await useCase.execute({ token: request.params.token });
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 7. Aceitar convite (Atleta autenticado)
  app.post(
    "/coach/invitations/accept",
    {
      schema: {
        operationId: "acceptCoachInvitation",
        tags: ["Coach"],
        summary: "Aceitar convite de treinador",
        body: AcceptCoachInvitationBodySchema,
        response: {
          200: AcceptCoachInvitationResponseSchema,
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
          return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new AcceptCoachInvitation();
        const result = await useCase.execute({
          athleteId: session.user.id,
          token: request.body.token,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 8. Consultar treinador ativo do atleta (Atleta autenticado)
  app.get(
    "/me/coach-relationship",
    {
      schema: {
        operationId: "getAthleteCoachRelationship",
        tags: ["Me"],
        summary: "Consultar vínculo ativo com treinador",
        response: {
          200: GetAthleteCoachRelationshipResponseSchema,
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
          return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new GetAthleteCoachRelationship();
        const result = await useCase.execute({ athleteId: session.user.id });
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 9. Encerrar vínculo com treinador pelo atleta (Atleta autenticado)
  app.delete(
    "/me/coach-relationship/:linkId",
    {
      schema: {
        operationId: "revokeAthleteCoachRelationship",
        tags: ["Me"],
        summary: "Atleta encerra vínculo com o treinador",
        params: RevokeCoachAthleteParamsSchema,
        response: {
          200: SuccessResponseSchema,
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
          return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
        }

        const useCase = new RevokeCoachAthleteLink();
        const result = await useCase.execute({
          userId: session.user.id,
          linkId: request.params.linkId,
        });

        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );
};
