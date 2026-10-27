import type { LanguageModelUsage } from "ai";

export const AI_MODEL = "gemini-2.5-flash";
export const AI_PRICING_SOURCE = "https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash";
export const AI_PRICING_VERSION = "gemini-2.5-flash-standard-2026-10-27";
export type AiFeature = "CHAT" | "SESSION_CHAT" | "ATHLETE_PLAN" | "COACH_PRESCRIPTION" | "COACH_INSIGHTS";
export type AiUsageContext = { userId: string; feature: AiFeature; hasAudio?: boolean };

// Standard paid-tier list prices in USD / 1M tokens. Persist the rate at call time.
// With mixed audio input, the entire input uses the audio rate (conservative estimate).
export function estimateAiUsage(usage?: Partial<LanguageModelUsage>, hasAudio = false) {
  const token = (n: number | undefined) => Number.isSafeInteger(n) && n! >= 0 ? n! : null;
  const inputTokens = token(usage?.inputTokens);
  const outputTokens = token(usage?.outputTokens);
  const reasoningTokens = token(usage?.outputTokenDetails?.reasoningTokens ?? usage?.reasoningTokens);
  const cachedInputTokens = token(usage?.inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens);
  const inputRate = hasAudio ? 1 : 0.3;
  const cachedInputRate = hasAudio ? 0.1 : 0.03;
  const outputRate = 2.5;
  const cached = Math.min(cachedInputTokens ?? 0, inputTokens ?? 0);
  // SDK outputTokens already includes reasoning: never charge it twice.
  const estimatedCostUsd = inputTokens === null || outputTokens === null ? null :
    ((inputTokens - cached) * inputRate + cached * cachedInputRate + outputTokens * outputRate) / 1_000_000;
  return { inputTokens, outputTokens, reasoningTokens, cachedInputTokens,
    estimatedCostUsd, inputRate, outputRate, cachedInputRate, pricingVersion: AI_PRICING_VERSION };
}
