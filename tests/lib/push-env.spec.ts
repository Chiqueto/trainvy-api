import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv/config", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("push environment secrets", () => {
  it.each([undefined, ""])("has no fallback secrets when unset (%s)", async (value) => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-only");
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-only");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-only");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-only");
    vi.stubEnv("WEB_APP_BASE_URL", "http://localhost:3000");
    for (const name of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "CRON_SECRET"]) {
      vi.stubEnv(name, value);
    }

    const { env } = await import("../../src/lib/env.js");
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(env.VAPID_PRIVATE_KEY).toBeUndefined();
    expect(env.VAPID_SUBJECT).toBeUndefined();
    expect(env.CRON_SECRET).toBeUndefined();
  });
});
