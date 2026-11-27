import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { BillingError } from "../domain/billing.js";
import { auth } from "../lib/auth.js";
import { env } from "../lib/env.js";
import {
  AsaasWebhookBodySchema,
  AsaasWebhookResponseSchema,
  BillingSuccessResponseSchema,
  CancelCoachSubscriptionBodySchema,
  CancelCoachSubscriptionResponseSchema,
  CoachBillingOverviewResponseSchema,
  DowngradePreviewBodySchema,
  DowngradePreviewResponseSchema,
  PendingDowngradeResponseSchema,
  PendingUpgradeResponseSchema,
  ScheduleDowngradeBodySchema,
  ScheduleDowngradeResponseSchema,
  StartCoachSubscriptionBodySchema,
  StartCoachSubscriptionResponseSchema,
  UpgradeCoachSubscriptionBodySchema,
  UpgradeCoachSubscriptionResponseSchema,
} from "../schemas/billing.js";
import { ErrorSchema } from "../schemas/index.js";
import {
  AsaasConfigurationError,
  AsaasIntegrationError,
} from "../services/AsaasClient.js";
import { logAsaasError } from "../services/AsaasErrorLogger.js";
import { CancelCoachSubscription } from "../usecases/billing/CancelCoachSubscription.js";
import { DowngradeCoachSubscription } from "../usecases/billing/DowngradeCoachSubscription.js";
import { GetCoachBillingOverview } from "../usecases/billing/GetCoachBillingOverview.js";
import {
  ProcessAsaasWebhook,
  verifyAsaasWebhookToken,
} from "../usecases/billing/ProcessAsaasWebhook.js";
import { StartCoachSubscription } from "../usecases/billing/StartCoachSubscription.js";
import { UpgradeCoachSubscription } from "../usecases/billing/UpgradeCoachSubscription.js";

function fail(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof BillingError) {
    return reply
      .status(error.status)
      .send({ error: error.message, code: error.code });
  }
  if (error instanceof AsaasConfigurationError) {
    return reply
      .status(503)
      .send({ error: error.message, code: error.code });
  }
  if (error instanceof AsaasIntegrationError) {
    return reply
      .status(502)
      .send({ error: error.message, code: error.code });
  }
  request.log.error({ message: "Billing operation failed" });
  return reply
    .status(500)
    .send({ error: "Internal server error", code: "INTERNAL_SERVER_ERROR" });
}

const billingErrors = {
  400: ErrorSchema,
  401: ErrorSchema,
  403: ErrorSchema,
  404: ErrorSchema,
  409: ErrorSchema,
  502: ErrorSchema,
  503: ErrorSchema,
  500: ErrorSchema,
};

async function requireAuthenticatedUserId(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });
  if (!session?.user) {
    await reply
      .status(401)
      .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
    return null;
  }
  return session.user.id;
}

export const billingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/billing/overview",
    {
      schema: {
        operationId: "getCoachBillingOverview",
        tags: ["Billing"],
        summary: "Consultar assinatura, pagamentos, reembolsos e planos do treinador",
        response: { 200: CoachBillingOverviewResponseSchema, ...billingErrors },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const userId = await requireAuthenticatedUserId(request, reply);
        if (!userId) return;
        return await new GetCoachBillingOverview().execute(userId);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  app.post(
    "/billing/subscription/start",
    {
      schema: {
        operationId: "startCoachSubscription",
        tags: ["Billing"],
        summary: "Iniciar assinatura profissional com checkout Asaas",
        body: StartCoachSubscriptionBodySchema,
        response: {
          200: StartCoachSubscriptionResponseSchema,
          ...billingErrors,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const userId = await requireAuthenticatedUserId(request, reply);
        if (!userId) return;
        return await new StartCoachSubscription().execute({
          userId,
          planCode: request.body.planCode,
          cpfCnpj: request.body.cpfCnpj,
          billingCycle: request.body.billingCycle,
        });
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  app.post(
    "/billing/subscription/cancel",
    {
      schema: {
        operationId: "cancelCoachSubscription",
        tags: ["Billing"],
        summary: "Cancelar assinatura profissional (com reembolso em até 7 dias)",
        body: CancelCoachSubscriptionBodySchema,
        response: {
          200: CancelCoachSubscriptionResponseSchema,
          ...billingErrors,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const userId = await requireAuthenticatedUserId(request, reply);
        if (!userId) return;
        return await new CancelCoachSubscription().execute({
          userId,
          reason: request.body?.reason,
        });
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  app.post(
    "/billing/subscription/upgrade",
    {
      schema: {
        operationId: "initiateCoachSubscriptionUpgrade",
        tags: ["Billing"],
        summary: "Iniciar upgrade imediato de plano da assinatura",
        body: UpgradeCoachSubscriptionBodySchema,
        response: {
          200: UpgradeCoachSubscriptionResponseSchema,
          ...billingErrors,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const userId = await requireAuthenticatedUserId(request, reply);
        if (!userId) return;
        return await new UpgradeCoachSubscription().initiate({
          userId,
          planCode: request.body.planCode,
          billingCycle: request.body.billingCycle,
        });
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  app.get(
    "/billing/subscription/upgrade/pending",
    {
      schema: {
        operationId: "getPendingCoachSubscriptionUpgrade",
        tags: ["Billing"],
        summary: "Consultar upgrade pendente da assinatura",
        response: { 200: PendingUpgradeResponseSchema, ...billingErrors },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const userId = await requireAuthenticatedUserId(request, reply);
        if (!userId) return;
        return await new UpgradeCoachSubscription().getPending(userId);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  app.post(
    "/billing/subscription/upgrade/cancel",
    {
      schema: {
        operationId: "cancelPendingCoachSubscriptionUpgrade",
        tags: ["Billing"],
        summary: "Cancelar upgrade pendente da assinatura",
        response: { 200: BillingSuccessResponseSchema, ...billingErrors },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const userId = await requireAuthenticatedUserId(request, reply);
        if (!userId) return;
        return await new UpgradeCoachSubscription().cancel(userId);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  app.post(
    "/billing/subscription/downgrade/preview",
    {
      schema: {
        operationId: "previewCoachSubscriptionDowngrade",
        tags: ["Billing"],
        summary: "Preview de alteração para plano inferior (downgrade)",
        body: DowngradePreviewBodySchema,
        response: { 200: DowngradePreviewResponseSchema, ...billingErrors },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const userId = await requireAuthenticatedUserId(request, reply);
        if (!userId) return;
        return await new DowngradeCoachSubscription().preview({
          userId,
          planCode: request.body.planCode,
          billingCycle: request.body.billingCycle,
        });
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  app.post(
    "/billing/subscription/downgrade",
    {
      schema: {
        operationId: "scheduleCoachSubscriptionDowngrade",
        tags: ["Billing"],
        summary: "Agendar downgrade de plano para o fim do ciclo atual",
        body: ScheduleDowngradeBodySchema,
        response: { 200: ScheduleDowngradeResponseSchema, ...billingErrors },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const userId = await requireAuthenticatedUserId(request, reply);
        if (!userId) return;
        return await new DowngradeCoachSubscription().schedule({
          userId,
          planCode: request.body.planCode,
          billingCycle: request.body.billingCycle,
          retainedAthleteIds: request.body.retainedAthleteIds,
          acknowledgeExcessAthletes: request.body.acknowledgeExcessAthletes,
        });
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  app.get(
    "/billing/subscription/downgrade/pending",
    {
      schema: {
        operationId: "getPendingCoachSubscriptionDowngrade",
        tags: ["Billing"],
        summary: "Consultar downgrade agendado pendente",
        response: { 200: PendingDowngradeResponseSchema, ...billingErrors },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const userId = await requireAuthenticatedUserId(request, reply);
        if (!userId) return;
        return await new DowngradeCoachSubscription().getPending(userId);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  app.post(
    "/billing/subscription/downgrade/cancel",
    {
      schema: {
        operationId: "cancelScheduledCoachSubscriptionDowngrade",
        tags: ["Billing"],
        summary: "Cancelar downgrade agendado antes do próximo ciclo",
        response: { 200: BillingSuccessResponseSchema, ...billingErrors },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const userId = await requireAuthenticatedUserId(request, reply);
        if (!userId) return;
        return await new DowngradeCoachSubscription().cancel(userId);
      } catch (error) {
        return fail(error, request, reply);
      }
    },
  );

  app.post(
    "/webhooks/asaas/billing",
    {
      schema: {
        operationId: "receiveAsaasBillingWebhook",
        tags: ["Billing Webhook"],
        summary: "Receber eventos de webhook do Asaas para assinaturas",
        body: AsaasWebhookBodySchema,
        response: {
          200: AsaasWebhookResponseSchema,
          401: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const providedHeader = request.headers["asaas-access-token"];
      const providedToken = Array.isArray(providedHeader)
        ? providedHeader[0]
        : providedHeader;

      if (!env.ASAAS_WEBHOOK_TOKEN) {
        await logAsaasError({
          processName: "AsaasWebhookRoute.config",
          error: new Error("ASAAS_WEBHOOK_TOKEN is not configured on the server."),
          httpStatus: 401,
          requestMethod: "POST",
          requestPath: "/webhooks/asaas/billing",
        });
        return reply.status(401).send({
          error: "Acesso negado: Token de webhook não configurado no servidor.",
          code: "WEBHOOK_TOKEN_NOT_CONFIGURED",
        });
      }

      if (!verifyAsaasWebhookToken(providedToken, env.ASAAS_WEBHOOK_TOKEN)) {
        await logAsaasError({
          processName: "AsaasWebhookRoute.auth",
          error: new Error("Invalid or missing asaas-access-token header."),
          httpStatus: 401,
          requestMethod: "POST",
          requestPath: "/webhooks/asaas/billing",
        });
        return reply.status(401).send({
          error: "Acesso negado: Token de webhook inválido.",
          code: "INVALID_WEBHOOK_TOKEN",
        });
      }

      try {
        const result = await new ProcessAsaasWebhook().execute(request.body);
        return reply.status(200).send({
          received: true,
          message: result.duplicate
            ? "Webhook duplicado ignorado."
            : "Webhook de billing recebido com sucesso.",
        });
      } catch (error) {
        request.log.error(error, "Erro interno ao processar webhook de billing Asaas");
        return reply.status(500).send({
          error: "Erro interno ao processar webhook de billing.",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  );
};
