import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { CoachAthleteError } from "../domain/coach-athlete.js";
import {
  InvalidCursorError,
  InvalidDateRangeError,
  InvalidTimezoneError,
  NotFoundError,
} from "../errors/index.js";
import { auth } from "../lib/auth.js";
import {
  CoachAthleteProgressExerciseEvolutionParamsSchema,
  CoachAthleteProgressExerciseEvolutionQuerySchema,
  CoachAthleteProgressExerciseEvolutionResponseSchema,
  CoachAthleteProgressExercisesParamsSchema,
  CoachAthleteProgressExercisesQuerySchema,
  CoachAthleteProgressExercisesResponseSchema,
  CoachAthleteProgressInsightsParamsSchema,
  CoachAthleteProgressInsightsQuerySchema,
  CoachAthleteProgressInsightsResponseSchema,
  CoachAthleteProgressOverviewParamsSchema,
  CoachAthleteProgressOverviewQuerySchema,
  CoachAthleteProgressOverviewResponseSchema,
  CoachAthleteProgressSessionParamsSchema,
  CoachAthleteProgressSessionResponseSchema,
  CoachAthleteProgressSessionsParamsSchema,
  CoachAthleteProgressSessionsQuerySchema,
  CoachAthleteProgressSessionsResponseSchema,
  GetAthleteProgressSharingResponseSchema,
  UpdateAthleteProgressSharingBodySchema,
} from "../schemas/coach-progress.js";
import { ErrorSchema } from "../schemas/index.js";
import { GetAthleteCoachProgressSharing } from "../usecases/GetAthleteCoachProgressSharing.js";
import { GetCoachAthleteProgressExerciseEvolution } from "../usecases/GetCoachAthleteProgressExerciseEvolution.js";
import { GetCoachAthleteProgressExercises } from "../usecases/GetCoachAthleteProgressExercises.js";
import { GetCoachAthleteProgressInsights } from "../usecases/GetCoachAthleteProgressInsights.js";
import { GetCoachAthleteProgressOverview } from "../usecases/GetCoachAthleteProgressOverview.js";
import { GetCoachAthleteProgressSessionDetail } from "../usecases/GetCoachAthleteProgressSessionDetail.js";
import { GetCoachAthleteProgressSessions } from "../usecases/GetCoachAthleteProgressSessions.js";
import { UpdateAthleteCoachProgressSharing } from "../usecases/UpdateAthleteCoachProgressSharing.js";

function fail(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof CoachAthleteError) {
    return reply.status(error.status).send({
      error: error.message,
      code: error.code,
    });
  }

  if (error instanceof NotFoundError) {
    return reply.status(404).send({
      error: error.message,
      code: error.code || "NOT_FOUND",
    });
  }

  if (
    error instanceof InvalidTimezoneError ||
    error instanceof InvalidDateRangeError ||
    error instanceof InvalidCursorError
  ) {
    return reply.status(400).send({
      error: error.message,
      code: error.code,
    });
  }

  request.log.error(error);
  return reply.status(500).send({
    error: "Erro interno no processamento do acompanhamento de evolução.",
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

export const coachProgressRoutes: FastifyPluginAsyncZod = async (app) => {
  // 1. Consultar estado e escopo de compartilhamento de evolução (Atleta)
  app.get(
    "/me/coach-progress-sharing",
    {
      schema: {
        operationId: "getAthleteCoachProgressSharing",
        tags: ["Me"],
        summary: "Consultar consentimento e escopo de compartilhamento de evolução",
        response: {
          200: GetAthleteProgressSharingResponseSchema,
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

        const useCase = new GetAthleteCoachProgressSharing();
        const result = await useCase.execute({ athleteId: session.user.id });
        reply.header("Cache-Control", "no-store, private");
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 2. Atualizar consentimento e escopo de compartilhamento de evolução (Atleta)
  app.patch(
    "/me/coach-progress-sharing",
    {
      schema: {
        operationId: "updateAthleteCoachProgressSharing",
        tags: ["Me"],
        summary: "Atualizar consentimento e escopo de compartilhamento de evolução",
        body: UpdateAthleteProgressSharingBodySchema,
        response: {
          200: GetAthleteProgressSharingResponseSchema,
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

        const useCase = new UpdateAthleteCoachProgressSharing();
        const result = await useCase.execute({
          athleteId: session.user.id,
          enabled: request.body.enabled,
          includePreviousHistory: request.body.includePreviousHistory,
        });

        reply.header("Cache-Control", "no-store, private");
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 3. Consultar visão geral de evolução e volume do aluno (Coach)
  app.get(
    "/coach/athletes/:athleteId/progress/overview",
    {
      schema: {
        operationId: "getCoachAthleteProgressOverview",
        tags: ["Coach"],
        summary: "Consultar visão geral, volume e distribuição de evolução do aluno",
        params: CoachAthleteProgressOverviewParamsSchema,
        querystring: CoachAthleteProgressOverviewQuerySchema,
        response: {
          200: CoachAthleteProgressOverviewResponseSchema,
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

        const useCase = new GetCoachAthleteProgressOverview();
        const result = await useCase.execute({
          coachId: session.user.id,
          athleteId: request.params.athleteId,
          tz: request.query.tz,
          weeksCount: request.query.weeksCount,
        });

        reply.header("Cache-Control", "no-store, private");
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 4. Listar sessões concluídas autorizadas do aluno (Coach)
  app.get(
    "/coach/athletes/:athleteId/progress/sessions",
    {
      schema: {
        operationId: "listCoachAthleteProgressSessions",
        tags: ["Coach"],
        summary: "Listar histórico de treinos concluídos autorizados do aluno",
        params: CoachAthleteProgressSessionsParamsSchema,
        querystring: CoachAthleteProgressSessionsQuerySchema,
        response: {
          200: CoachAthleteProgressSessionsResponseSchema,
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

        const useCase = new GetCoachAthleteProgressSessions();
        const result = await useCase.execute({
          coachId: session.user.id,
          athleteId: request.params.athleteId,
          cursor: request.query.cursor,
          limit: request.query.limit,
          origin: request.query.origin,
        });

        reply.header("Cache-Control", "no-store, private");
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 5. Consultar detalhe de sessão concluída autorizada do aluno (Coach)
  app.get(
    "/coach/athletes/:athleteId/progress/sessions/:sessionId",
    {
      schema: {
        operationId: "getCoachAthleteProgressSessionDetail",
        tags: ["Coach"],
        summary: "Consultar detalhe e snapshot histórico de treino concluído do aluno",
        params: CoachAthleteProgressSessionParamsSchema,
        response: {
          200: CoachAthleteProgressSessionResponseSchema,
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

        const useCase = new GetCoachAthleteProgressSessionDetail();
        const result = await useCase.execute({
          coachId: session.user.id,
          athleteId: request.params.athleteId,
          sessionId: request.params.sessionId,
        });

        reply.header("Cache-Control", "no-store, private");
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 6. Listar exercícios do histórico autorizado do aluno (Coach)
  app.get(
    "/coach/athletes/:athleteId/progress/exercises",
    {
      schema: {
        operationId: "listCoachAthleteProgressExercises",
        tags: ["Coach"],
        summary: "Listar exercícios presentes no histórico autorizado do aluno",
        params: CoachAthleteProgressExercisesParamsSchema,
        querystring: CoachAthleteProgressExercisesQuerySchema,
        response: {
          200: CoachAthleteProgressExercisesResponseSchema,
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

        const useCase = new GetCoachAthleteProgressExercises();
        const result = await useCase.execute({
          coachId: session.user.id,
          athleteId: request.params.athleteId,
          query: request.query.q,
          onlyWithHistory: request.query.onlyWithHistory === "false" ? false : true,
        });

        reply.header("Cache-Control", "no-store, private");
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 7. Consultar evolução e PR de exercício no histórico autorizado do aluno (Coach)
  app.get(
    "/coach/athletes/:athleteId/progress/exercises/:exerciseId",
    {
      schema: {
        operationId: "getCoachAthleteProgressExerciseEvolution",
        tags: ["Coach"],
        summary: "Consultar evolução longitudinal e PR de exercício autorizado do aluno",
        params: CoachAthleteProgressExerciseEvolutionParamsSchema,
        querystring: CoachAthleteProgressExerciseEvolutionQuerySchema,
        response: {
          200: CoachAthleteProgressExerciseEvolutionResponseSchema,
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

        const useCase = new GetCoachAthleteProgressExerciseEvolution();
        const result = await useCase.execute({
          coachId: session.user.id,
          athleteId: request.params.athleteId,
          exerciseId: request.params.exerciseId,
          cursor: request.query.cursor,
          limit: request.query.limit,
        });

        reply.header("Cache-Control", "no-store, private");
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  // 8. Consultar Diagnóstico e Insights de Evolução com IA (Coach)
  app.get(
    "/coach/athletes/:athleteId/progress/insights",
    {
      schema: {
        operationId: "getCoachAthleteProgressInsights",
        tags: ["Coach"],
        summary: "Consultar diagnóstico analítico e insights de evolução com IA para o aluno",
        params: CoachAthleteProgressInsightsParamsSchema,
        querystring: CoachAthleteProgressInsightsQuerySchema,
        response: {
          200: CoachAthleteProgressInsightsResponseSchema,
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

        const useCase = new GetCoachAthleteProgressInsights();
        const result = await useCase.execute({
          coachId: session.user.id,
          athleteId: request.params.athleteId,
          tz: request.query.tz,
          weeksCount: request.query.weeksCount,
        });

        reply.header("Cache-Control", "no-store, private");
        return reply.status(200).send(result);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );
};

