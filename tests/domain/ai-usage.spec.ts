import { describe, expect, it } from "vitest";
import type { LanguageModelUsage } from "ai";
import { estimateAiUsage } from "../../src/domain/ai-usage.js";

describe("AI provider cost estimates", () => {
  it("prices cached input separately and never doubles reasoning tokens", () => {
    const result = estimateAiUsage({
      inputTokens: 1000000,
      outputTokens: 1000000,
      cachedInputTokens: 200000,
      reasoningTokens: 300000,
    });
    expect(result.estimatedCostUsd).toBeCloseTo(2.746, 9);
  });
  it("uses an explicit conservative audio price and unknown usage remains unpriced", () => {
    expect(
      estimateAiUsage({ inputTokens: 1000000, outputTokens: 0 }, true)
        .estimatedCostUsd,
    ).toBe(1);
    expect(estimateAiUsage().estimatedCostUsd).toBeNull();
    expect(
      estimateAiUsage({ inputTokens: 0, outputTokens: 0 }).estimatedCostUsd,
    ).toBe(0);
    expect(
      estimateAiUsage({ inputTokens: -1, outputTokens: 0 }).estimatedCostUsd,
    ).toBeNull();
  });
  it("uses SDK v6 detailed counts and clamps cached tokens to total input", () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 20,
      inputTokenDetails: { cacheReadTokens: 200 },
      outputTokenDetails: { reasoningTokens: 5 },
    } as LanguageModelUsage;
    expect(estimateAiUsage(usage).estimatedCostUsd).toBeCloseTo(0.000053, 9);
  });
});
