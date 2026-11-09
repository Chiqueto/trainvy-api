import { describe, expect, it } from "vitest";
import { resolveAiAccess } from "../../src/domain/ai-access.js";
describe("AI plan access", () => {
  const base = {
    accountType: "COACH",
    plan: { code: "COACH", name: "Coach" },
    entitlements: [{ key: "MANAGE_ATHLETES", limitValue: 5 }],
  };
  it("does not grant AI from the coach role, other permissions or an internal plan name", () => {
    expect(resolveAiAccess(base, "AI_PLAN_GENERATION")).toMatchObject({
      enabled: false,
      dailyLimit: 0,
    });
    expect(
      resolveAiAccess({ ...base, plan: { code: "INTERNAL", name: "Internal" } })
        .enabled,
    ).toBe(false);
  });
  it("requires each AI permission and shares the most restrictive configured daily cap", () => {
    const context = {
      ...base,
      entitlements: [
        { key: "AI_CHAT", limitValue: 8 },
        { key: "AI_PLAN_GENERATION", limitValue: 12 },
      ],
    };
    expect(resolveAiAccess(context).dailyLimit).toBe(8);
    expect(resolveAiAccess(context, "AI_PLAN_GENERATION").dailyLimit).toBe(8);
    expect(
      resolveAiAccess(
        { ...base, entitlements: [{ key: "AI_CHAT", limitValue: 8 }] },
        "AI_PLAN_GENERATION",
      ).enabled,
    ).toBe(false);
  });
  it("zero explicitly blocks requests; null uses a bounded default only when entitled", () => {
    expect(
      resolveAiAccess({
        ...base,
        entitlements: [{ key: "AI_CHAT", limitValue: 0 }],
      }).dailyLimit,
    ).toBe(0);
    expect(
      resolveAiAccess({
        ...base,
        entitlements: [{ key: "AI_CHAT", limitValue: null }],
      }).dailyLimit,
    ).toBe(30);
  });
});
