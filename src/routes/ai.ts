import { google } from "@ai-sdk/google";
import { convertToModelMessages, stepCountIs, streamText, UIMessage } from "ai";
import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

import { getInSessionSystemPrompt, getSystemPrompt } from "../ai/system-prompt.js";
import { getAiTools, getSessionAiTools } from "../ai/tools.js";
import { AiRateLimitError, InvalidTimezoneError, NotFoundError } from "../errors/index.js";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/db.js";
import {
  AiConversationParamsSchema,
  CreateAiConversationBodySchema,
  CreateAiConversationResponseSchema,
  ErrorSchema,
  GetAiConversationResponseSchema,
  ListAiConversationsQuerySchema,
  ListAiConversationsResponseSchema,
  SuccessResponseSchema,
  UpdateUserAiConsentBodySchema,
  UserAiConsentResponseSchema,
} from "../schemas/index.js";
import { CheckAndConsumeAiQuota } from "../usecases/CheckAndConsumeAiQuota.js";
import { recordAiUsage } from "../usecases/RecordAiUsage.js";
import { CreateAiConversation } from "../usecases/CreateAiConversation.js";
import { DeleteAiConversation } from "../usecases/DeleteAiConversation.js";
import { GetAiConversation } from "../usecases/GetAiConversation.js";
import { GetUserAiConsent } from "../usecases/GetUserAiConsent.js";
import { ListAiConversations } from "../usecases/ListAiConversations.js";
import { SaveAiMessages } from "../usecases/SaveAiMessages.js";
import { UpdateUserAiConsent } from "../usecases/UpdateUserAiConsent.js";

function getFirstUserMessageSummary(messages: UIMessage[]): string | null {
  for (const msg of messages) {
    if (msg.role === "user" && Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        if (
          part.type === "text" &&
          typeof (part as { text?: string }).text === "string"
        ) {
          const text = (part as { text: string }).text.trim();
          if (text) return text;
        }
      }
      for (const part of msg.parts) {
        if (part.type === "file") {
          const filePart = part as { mediaType?: string; filename?: string };
          if (filePart.mediaType?.startsWith("audio/")) {
            return "Mensagem de voz";
          }
          if (filePart.mediaType === "application/pdf") {
            return filePart.filename
              ? `Documento: ${filePart.filename}`
              : "Ficha de treino em PDF";
          }
          if (filePart.mediaType?.startsWith("image/")) {
            return filePart.filename
              ? `Imagem: ${filePart.filename}`
              : "Imagem de treino";
          }
          return filePart.filename || "Arquivo anexado";
        }
      }
    }
  }
  return null;
}

export function sanitizeMessagesForRevokedHistory(messages: UIMessage[]): UIMessage[] {
  const historyToolNames = new Set([
    "getWeeklyTrainingAnalytics",
    "getMuscleTrainingAnalytics",
    "getExerciseEvolution",
    "getWorkoutHistorySession",
    "listWorkoutHistory",
    "getRecentTrainingHistory",
    "getRecentTrainingFeedback",
  ]);

  return messages.map((msg) => {
    if (!Array.isArray(msg.parts)) return msg;
    const sanitizedParts = msg.parts.map((part: any) => {
      const name = part.type === "dynamic-tool" ? part.toolName : part.type?.replace(/^tool-/, "");
      if (historyToolNames.has(name) && "output" in part) {
        return { ...part, output: { notice: "O acesso ao histórico foi revogado pelo atleta." } };
      }
      if (
        part.type === "tool-invocation" &&
        part.toolInvocation &&
        historyToolNames.has(part.toolInvocation.toolName)
      ) {
        return {
          ...part,
          toolInvocation: {
            ...part.toolInvocation,
            result: {
              notice:
                "O acesso ao histórico de treinos anteriores foi revogado pelo atleta sob as preferências de privacidade da conta.",
            },
          },
        };
      }
      return part;
    });
    return { ...msg, parts: sanitizedParts };
  });
}

export const aiRoutes = async (app: FastifyInstance) => {
  // 1. Chat with AI Coach: POST /ai
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
      tags: ["AI"],
      summary: "Chat with AI Coach (Trainvy)",
      querystring: z.object({
        conversationId: z.string().uuid().optional(),
        workoutSessionId: z.string().uuid().optional(),
        sessionExerciseId: z.string().uuid().optional(),
      }),
      body: z.object({
        messages: z.array(z.any()),
        conversationId: z.string().uuid().optional(),
        timezone: z.string().max(255).optional(),
        workoutSessionId: z.string().uuid().optional(),
        sessionExerciseId: z.string().uuid().optional(),
      }),
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply
          .status(401)
          .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
      }

      const userId = session.user.id;
      const userName = session.user.name;

      // Proteção de cotas e rate limit persistente para o Beta
      try {
        const checkQuota = new CheckAndConsumeAiQuota();
        await checkQuota.execute({ userId });
      } catch (error) {
        if (error instanceof AiRateLimitError) {
          return reply.status(429).send({
            error: error.message,
            code: error.code,
            resetAt: error.resetAt,
          });
        }
        throw error;
      }

      const {
        messages: incomingMessages,
        conversationId: bodyConversationId,
        timezone,
        workoutSessionId: bodySessionId,
        sessionExerciseId: bodyExerciseId,
      } = request.body as {
        messages: UIMessage[];
        conversationId?: string;
        timezone?: string;
        workoutSessionId?: string;
        sessionExerciseId?: string;
      };

      const querySessionId = request.query.workoutSessionId;
      const queryExerciseId = request.query.sessionExerciseId;
      const workoutSessionId = bodySessionId || querySessionId;
      const sessionExerciseId = bodyExerciseId || queryExerciseId;

      const queryConversationId = request.query.conversationId;
      const requestedConversationId = bodyConversationId || queryConversationId;

      // Consulta de consentimento LGPD do atleta
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { aiTrainingHistoryAccess: true },
      });
      const hasHistoryConsent = user?.aiTrainingHistoryAccess ?? false;

      // Se o atleta revogou o consentimento, sanitiza mensagens anteriores para não reenviar histórico vazado
      const messages = hasHistoryConsent
        ? incomingMessages
        : sanitizeMessagesForRevokedHistory(incomingMessages);

      let tools: any;
      let systemPrompt: string;
      let conversationId = requestedConversationId;

      if (workoutSessionId) {
        // Validação estrita de ownership da sessão de treino
        const sessionRecord = await prisma.workoutSession.findFirst({
          where: {
            id: workoutSessionId,
            athleteId: userId,
          },
          select: { id: true },
        });

        if (!sessionRecord) {
          return reply.status(404).send({
            error: "Sessão de treino não encontrada.",
            code: "NOT_FOUND",
          });
        }

        // Validação do exercício na sessão, se fornecido
        if (sessionExerciseId) {
          const exerciseRecord = await prisma.sessionExercise.findFirst({
            where: {
              id: sessionExerciseId,
              workoutSessionId,
            },
            select: { id: true },
          });

          if (!exerciseRecord) {
            return reply.status(404).send({
              error: "Exercício não encontrado nesta sessão de treino.",
              code: "NOT_FOUND",
            });
          }
        }

        // Vinculação e isolamento imutável da conversa com a sessão
        if (conversationId) {
          const existing = await prisma.aiConversation.findFirst({
            where: {
              id: conversationId,
              userId,
              workoutSessionId,
            },
          });

          if (!existing) {
            return reply.status(404).send({
              error: "Conversa não encontrada ou não pertence a esta sessão de treino.",
              code: "NOT_FOUND",
            });
          }
        } else {
          // Busca conversa ativa pré-existente para a sessão ou cria uma nova
          const existingSessionConv = await prisma.aiConversation.findFirst({
            where: {
              userId,
              workoutSessionId,
            },
            orderBy: { createdAt: "desc" },
          });

          if (existingSessionConv) {
            conversationId = existingSessionConv.id;
          } else {
            const initialText = getFirstUserMessageSummary(messages);
            const createConversation = new CreateAiConversation();
            const created = await createConversation.execute({
              userId,
              initialMessageText: initialText,
              workoutSessionId,
              title: "Assistente de Treino",
            });
            conversationId = created.id;
          }
        }

        try {
          tools = getSessionAiTools(userId, {
            workoutSessionId,
            sessionExerciseId,
            timezone,
          });
        } catch (error) {
          if (error instanceof InvalidTimezoneError) {
            return reply.status(400).send({
              error: error.message,
              code: "INVALID_TIMEZONE",
            });
          }
          throw error;
        }

        systemPrompt = getInSessionSystemPrompt(userName);
      } else {
        // Chat geral fora do treino - isolado de qualquer sessão de treino
        if (conversationId) {
          const existing = await prisma.aiConversation.findFirst({
            where: {
              id: conversationId,
              userId,
              workoutSessionId: null,
            },
          });

          if (!existing) {
            return reply.status(404).send({
              error: "Conversa não encontrada no contexto geral.",
              code: "NOT_FOUND",
            });
          }
        } else {
          const initialText = getFirstUserMessageSummary(messages);
          const createConversation = new CreateAiConversation();
          const created = await createConversation.execute({
            userId,
            initialMessageText: initialText,
            workoutSessionId: null,
          });
          conversationId = created.id;
        }

        try {
          tools = getAiTools(userId, { timezone, conversationId });
        } catch (error) {
          if (error instanceof InvalidTimezoneError) {
            return reply.status(400).send({
              error: error.message,
              code: "INVALID_TIMEZONE",
            });
          }
          throw error;
        }

        systemPrompt = getSystemPrompt(userName);
      }

      const result = streamText({
        model: google("gemini-2.5-flash"),
        system: systemPrompt,
        messages: await convertToModelMessages(messages),
        stopWhen: stepCountIs(10),
        tools,
        onStepFinish: async ({ usage }) => {
          await recordAiUsage({ userId, feature: workoutSessionId ? "SESSION_CHAT" : "CHAT",
            hasAudio: messages.some(m => m.parts?.some(p => p.type === "file" && p.mediaType?.startsWith("audio/"))) }, usage);
        },
        onError: async () => {
          await recordAiUsage({ userId, feature: workoutSessionId ? "SESSION_CHAT" : "CHAT" }, undefined, "ERROR");
        },
      });

      const response = result.toUIMessageStreamResponse({
        originalMessages: messages,
        onFinish: async ({ messages: finalMessages }) => {
          try {
            const saveAiMessages = new SaveAiMessages();
            await saveAiMessages.execute({
              userId,
              conversationId: conversationId!,
              messages: finalMessages,
            });
          } catch (err) {
            app.log.error(err, "Failed to persist AI messages on finish");
          }
        },
      });

      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.header("x-conversation-id", conversationId);
      return reply.send(response.body);
    },
  });

  // 2. List Conversations: GET /ai/conversations
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/conversations",
    schema: {
      tags: ["AI"],
      summary: "List all AI conversations for current user",
      querystring: ListAiConversationsQuerySchema,
      response: {
        200: ListAiConversationsResponseSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply
          .status(401)
          .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
      }

      const workoutSessionId = request.query.workoutSessionId;

      if (workoutSessionId) {
        const sessionRecord = await prisma.workoutSession.findFirst({
          where: {
            id: workoutSessionId,
            athleteId: session.user.id,
          },
          select: { id: true },
        });

        if (!sessionRecord) {
          return reply.status(404).send({
            error: "Sessão de treino não encontrada.",
            code: "NOT_FOUND",
          });
        }
      }

      const listConversations = new ListAiConversations();
      const conversations = await listConversations.execute({
        userId: session.user.id,
        workoutSessionId: workoutSessionId ?? null,
      });

      return reply.status(200).send({ conversations });
    },
  });

  // 3. Create Conversation: POST /ai/conversations
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/conversations",
    schema: {
      tags: ["AI"],
      summary: "Create a new AI conversation thread",
      body: CreateAiConversationBodySchema,
      response: {
        201: CreateAiConversationResponseSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply
          .status(401)
          .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
      }

      const createConversation = new CreateAiConversation();
      const created = await createConversation.execute({
        userId: session.user.id,
        title: request.body.title,
      });

      return reply.status(201).send(created);
    },
  });

  // 4. Get Conversation: GET /ai/conversations/:id
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/conversations/:id",
    schema: {
      tags: ["AI"],
      summary: "Get AI conversation by ID with messages",
      params: AiConversationParamsSchema,
      response: {
        200: GetAiConversationResponseSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply
          .status(401)
          .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
      }

      try {
        const getConversation = new GetAiConversation();
        const result = await getConversation.execute({
          userId: session.user.id,
          conversationId: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        throw error;
      }
    },
  });

  // 5. Delete Conversation: DELETE /ai/conversations/:id
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "DELETE",
    url: "/conversations/:id",
    schema: {
      tags: ["AI"],
      summary:
        "Delete AI conversation (never removes workout plans or periodizations)",
      params: AiConversationParamsSchema,
      response: {
        200: SuccessResponseSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply
          .status(401)
          .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
      }

      try {
        const deleteConversation = new DeleteAiConversation();
        const result = await deleteConversation.execute({
          userId: session.user.id,
          conversationId: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        throw error;
      }
    },
  });

  // 6. Get AI Consent: GET /ai/consent
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/consent",
    schema: {
      tags: ["AI"],
      summary: "Get AI history training access consent status (LGPD)",
      response: {
        200: UserAiConsentResponseSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply
          .status(401)
          .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
      }

      try {
        const getConsent = new GetUserAiConsent();
        const result = await getConsent.execute({
          userId: session.user.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        throw error;
      }
    },
  });

  // 7. Update AI Consent: PATCH /ai/consent
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "PATCH",
    url: "/consent",
    schema: {
      tags: ["AI"],
      summary: "Update AI history training access consent status (LGPD)",
      body: UpdateUserAiConsentBodySchema,
      response: {
        200: UserAiConsentResponseSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!session) {
        return reply
          .status(401)
          .send({ error: "Unauthorized", code: "UNAUTHORIZED" });
      }

      try {
        const updateConsent = new UpdateUserAiConsent();
        const result = await updateConsent.execute({
          userId: session.user.id,
          aiTrainingHistoryAccess: request.body.aiTrainingHistoryAccess,
        });

        return reply.status(200).send(result);
      } catch (error) {
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        throw error;
      }
    },
  });
};
