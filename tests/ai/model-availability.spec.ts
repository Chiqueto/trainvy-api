import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  assert: vi.fn(),
  transform: null as
    | null
    | ((input: { params: { prompt: [] } }) => Promise<unknown>),
}));
vi.mock("../../src/usecases/AiAvailability.js", () => ({
  assertAiEnabledForUser: state.assert,
}));
vi.mock("../../src/usecases/LegalCompliance.js", () => ({
  assertHealthConsent: vi.fn(),
  assertAthleteHealthConsent: vi.fn(),
}));
vi.mock("@ai-sdk/google", () => ({ google: () => ({}) }));
vi.mock("ai", () => ({
  wrapLanguageModel: ({
    middleware,
  }: {
    middleware: { transformParams: typeof state.transform };
  }) => {
    state.transform = middleware.transformParams;
    return {};
  },
}));
import { privateModel } from "../../src/ai/private-model.js";
beforeEach(() => vi.resetAllMocks());
it("checks the professional actor on every provider step, independently of the athlete whose data is analyzed", async () => {
  privateModel([], "student-id", "ATHLETE", "professional-id");
  await state.transform!({ params: { prompt: [] } });
  expect(state.assert).toHaveBeenLastCalledWith("professional-id");
  state.assert.mockRejectedValueOnce(new Error("AI_DISABLED"));
  await expect(state.transform!({ params: { prompt: [] } })).rejects.toThrow(
    "AI_DISABLED",
  );
  expect(state.assert).toHaveBeenCalledTimes(2);
});
