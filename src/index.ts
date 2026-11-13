import "dotenv/config";

import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import fastifyApiReference from "@scalar/fastify-api-reference";
import { fromNodeHeaders } from "better-auth/node";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import z from "zod";

import { CoachAthleteError } from "./domain/coach-athlete.js";
import { requiresHealthConsent } from "./domain/compliance.js";
import { auth, authBaseUrl, trustedOrigins } from "./lib/auth.js";
import { env } from "./lib/env.js";
import { adminRoutes } from "./routes/admin.js";
import { aiRoutes } from "./routes/ai.js";
import { aiAvailabilityRoutes } from "./routes/ai-availability.js";
import { coachRoutes } from "./routes/coach.js";
import { coachPrescriptionRoutes } from "./routes/coach-prescription.js";
import { coachProgressRoutes } from "./routes/coach-progress.js";
import { coachTemplateRoutes } from "./routes/coach-template.js";
import { commercialRoutes } from "./routes/commercial.js";
import { complianceRoutes } from "./routes/compliance.js";
import { cronRoutes } from "./routes/cron.js";
import { exerciseRoutes } from "./routes/exercise.js";
import { featureTermsRoutes } from "./routes/feature-terms.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { historyRoutes } from "./routes/history.js";
import { homeRoutes } from "./routes/home.js";
import { meRoutes } from "./routes/me.js";
import { notificationPreferencesRoutes } from "./routes/notification-preferences.js";
import { notificationRoutes } from "./routes/notifications.js";
import { operationsRoutes } from "./routes/operations.js";
import { periodizationRoutes } from "./routes/periodization.js";
import { planningRoutes } from "./routes/planning.js";
import { professionalVerificationRoutes } from "./routes/professional-verification.js";
import { pushSubscriptionRoutes } from "./routes/push-subscriptions.js";
import { sessionFeedbackRoutes } from "./routes/session-feedback.js";
import { sportsProfileRoutes } from "./routes/sports-profile.js";
import { statsRoutes } from "./routes/stats.js";
import { workoutEditRoutes } from "./routes/workout-edit.js";
import { WorkoutPlanRoutes } from "./routes/workout-plan.js";
import { workoutSessionRoutes } from "./routes/workout-session.js";
import { workoutSessionRecoveryRoutes } from "./routes/workout-session-recovery.js";
import { ApplicationAccessLogs } from "./usecases/ApplicationAccessLogs.js";
import { assertHealthWriteAccess } from "./usecases/LegalCompliance.js";

const isVercel = Boolean(process.env.VERCEL);

const envToLogger = {
  development: isVercel
    ? true
    : {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      },
  production: true,
  test: false,
};

const selectedLogger = envToLogger[env.NODE_ENV];
const app = Fastify({
  logger:
    env.NODE_ENV === "test"
      ? false
      : {
          ...(typeof selectedLogger === "object" ? selectedLogger : {}),
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              'res.headers["set-cookie"]',
            ],
            censor: "[REDACTED]",
          },
        },
  bodyLimit: 25 * 1024 * 1024, // 25MB para permitir áudios e documentos multimodais
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.addHook("preHandler", async (request, reply) => {
  if (!requiresHealthConsent(request.method, request.url)) return;
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });
  if (!session) return;
  try {
    await assertHealthWriteAccess(session.user.id, request.method, request.url);
  } catch (error) {
    if (error instanceof CoachAthleteError)
      return reply.code(403).send({ code: error.code, error: error.message });
    throw error;
  }
});

const accessIdentities = new WeakMap<object, string>();
app.addHook("onRequest", async (request) => {
  if (!request.headers.cookie) return;
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (session) accessIdentities.set(request, session.user.id);
  } catch (error) {
    request.log.error(error, "Application access identity lookup failed");
  }
});
app.addHook("onResponse", async (request) => {
  const userId = accessIdentities.get(request);
  if (!userId) return;
  try {
    await new ApplicationAccessLogs().record(userId, request.ip);
  } catch (error) {
    request.log.error(error, "Application access log failed");
  }
});

await app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Bootcamp Treinos API",
      description: "Sample backend service",
      version: "1.0.0",
    },
    servers: [
      {
        description: "API Base Url",
        url: env.API_BASE_URL,
      },
      {
        description: "GitHub Codespace",
        url: "https://shiny-trout-7xqw455j4vxhp44q-8080.app.github.dev",
      },
    ],
  },
  transform: jsonSchemaTransform,
  transformObject: jsonSchemaTransformObject,
});

await app.register(fastifyCors, {
  origin: trustedOrigins,
  credentials: true,
});

await app.register(fastifyApiReference, {
  routePrefix: "/docs",
  configuration: {
    sources: [
      {
        title: "Bootcamp Treinos API",
        slug: "bootcamp-treinos-api",
        url: "/swagger.json",
      },
      {
        title: "Auth API",
        slug: "auth-api",
        url: "/api/auth/open-api/generate-schema",
      },
    ],
  },
});

await app.register(WorkoutPlanRoutes, { prefix: "/workout-plans" });
await app.register(periodizationRoutes, { prefix: "/periodizations" });
await app.register(planningRoutes, { prefix: "/planning" });
await app.register(homeRoutes, { prefix: "/home" });
await app.register(statsRoutes, { prefix: "/stats" });
await app.register(meRoutes, { prefix: "/me" });
await app.register(aiRoutes, { prefix: "/ai" });
await app.register(exerciseRoutes, { prefix: "/exercises" });
await app.register(historyRoutes, { prefix: "/history" });
await app.register(workoutSessionRoutes);
await app.register(workoutSessionRecoveryRoutes);
await app.register(workoutEditRoutes);
await app.register(sessionFeedbackRoutes);
await app.register(sportsProfileRoutes);
await app.register(commercialRoutes);
await app.register(coachRoutes);
await app.register(professionalVerificationRoutes);
await app.register(featureTermsRoutes);
await app.register(complianceRoutes);
await app.register(operationsRoutes);
await app.register(aiAvailabilityRoutes);
await app.register(coachPrescriptionRoutes);
await app.register(coachProgressRoutes);
await app.register(coachTemplateRoutes);
await app.register(feedbackRoutes, { prefix: "/feedback" });
await app.register(adminRoutes, { prefix: "/admin" });
await app.register(pushSubscriptionRoutes, { prefix: "/push-subscriptions" });
await app.register(notificationRoutes, { prefix: "/notifications" });
await app.register(notificationPreferencesRoutes, {
  prefix: "/notification-preferences",
});
await app.register(cronRoutes, { prefix: "/cron" });

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/swagger.json",
  schema: {
    hide: true,
  },
  handler: async () => {
    return app.swagger();
  },
});

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/",
  schema: {
    description: "Hello world route",
    tags: ["Hello World"],
    response: {
      200: z.object({
        message: z.string(),
      }),
    },
  },
  handler: () => {
    return {
      message: "Hello world!",
    };
  },
});

app.route({
  schema: {
    hide: true,
  },
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      // Build Fetch API Request without insecure host inference
      const subPath = request.url.replace(/^\/api\/auth/, "");
      const targetUrl = new URL(`${authBaseUrl}${subPath}`);

      // Convert Fastify headers to standard Headers object
      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) headers.append(key, value.toString());
      });
      // Create Fetch API-compatible request
      const req = new Request(targetUrl.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      // Process authentication request
      const response = await auth.handler(req);
      // Forward response to client
      reply.status(response.status);

      // Forward headers, preserving multiple Set-Cookie headers
      if (typeof response.headers.getSetCookie === "function") {
        const setCookies = response.headers.getSetCookie();
        if (setCookies.length > 0) {
          reply.header("set-cookie", setCookies);
        }
      }
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "set-cookie") {
          reply.header(key, value);
        }
      });

      const responseBody = response.body ? await response.text() : null;
      reply.send(responseBody);
    } catch (error) {
      app.log.error(error);
      reply.status(500).send({
        error: "Internal authentication error",
        code: "AUTH_FAILURE",
      });
    }
  },
});

if (!isVercel) {
  try {
    await app.listen({ host: "0.0.0.0", port: Number(env.PORT) || 8080 });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

export default async function handler(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
) {
  await app.ready();
  app.server.emit("request", req, res);
}
