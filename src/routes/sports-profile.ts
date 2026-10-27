import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { NotFoundError } from "../errors/index.js";
import { auth } from "../lib/auth.js";
import { ErrorSchema } from "../schemas/index.js";
import {
  SportsProfileBody,
  SportsProfileResponse,
} from "../schemas/sports-profile.js";
import {
  GetSportsProfile,
  UpdateSportsProfile,
} from "../usecases/SportsProfile.js";

export const sportsProfileRoutes: FastifyPluginAsyncZod = async (app) => {
  const response = {
    200: SportsProfileResponse,
    400: ErrorSchema,
    401: ErrorSchema,
    404: ErrorSchema,
    500: ErrorSchema,
  };
  app.get(
    "/me/sports-profile",
    {
      schema: {
        operationId: "getSportsProfile",
        tags: ["Me"],
        summary: "Get own optional sports profile",
        response,
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
        return await new GetSportsProfile().execute(session.user.id);
      } catch (error) {
        if (error instanceof NotFoundError)
          return reply
            .status(404)
            .send({ error: error.message, code: error.code });
        request.log.error(error);
        return reply
          .status(500)
          .send({
            error: "Falha ao carregar perfil esportivo.",
            code: "INTERNAL_ERROR",
          });
      }
    },
  );
  app.patch(
    "/me/sports-profile",
    {
      schema: {
        operationId: "updateSportsProfile",
        tags: ["Me"],
        summary:
          "Update own sports profile without changing body metric history",
        body: SportsProfileBody,
        response,
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
        return await new UpdateSportsProfile().execute(
          session.user.id,
          request.body,
        );
      } catch (error) {
        request.log.error(error);
        return reply
          .status(500)
          .send({
            error: "Falha ao salvar perfil esportivo.",
            code: "INTERNAL_ERROR",
          });
      }
    },
  );
};
