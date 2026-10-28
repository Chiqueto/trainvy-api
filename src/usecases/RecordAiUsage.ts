import { type LanguageModelUsage,NoObjectGeneratedError } from "ai";

import {
  AI_MODEL,
  type AiUsageContext,
  estimateAiUsage,
} from "../domain/ai-usage.js";
import { prisma } from "../lib/db.js";

export async function recordAiUsage(
  context: AiUsageContext,
  usage?: Partial<LanguageModelUsage>,
  status = "SUCCESS",
  errorMessage?: string | null,
) {
  try {
    await prisma.aiUsageEvent.create({
      data: {
        userId: context.userId,
        feature: context.feature,
        model: AI_MODEL,
        status,
        errorMessage: errorMessage ? errorMessage.trim().slice(0, 4000) : null,
        ...estimateAiUsage(usage, context.hasAudio),
      },
    });
  } catch {
    // A telemetry outage must not discard a generated workout or interrupt chat.
    console.error("AI_USAGE_PERSISTENCE_FAILED", { feature: context.feature });
  }
}

export async function trackAiGeneration<
  T extends { usage: LanguageModelUsage },
>(context: AiUsageContext, generate: () => Promise<T>): Promise<T> {
  try {
    const result = await generate();
    await recordAiUsage(context, result.usage);
    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    await recordAiUsage(
      context,
      NoObjectGeneratedError.isInstance(error) ? error.usage : undefined,
      "ERROR",
      errorMessage,
    );
    throw error;
  }
}
