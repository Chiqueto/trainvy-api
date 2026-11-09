import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
const mock = vi.hoisted(() => ({
  session: vi.fn(),
  ready: vi.fn(),
  feedback: vi.fn(),
}));
vi.mock("../../src/lib/auth.js", () => ({
  auth: { api: { getSession: mock.session } },
}));
vi.mock("../../src/usecases/CheckReadiness.js", () => ({
  CheckReadiness: class {
    execute = mock.ready;
  },
}));
vi.mock("../../src/usecases/ListAdminFeedback.js", () => ({
  ListAdminFeedback: class {
    execute = mock.feedback;
  },
}));
import { operationsRoutes } from "../../src/routes/operations.js";
import { AdminError } from "../../src/lib/require-admin.js";
describe("operational HTTP endpoints", () => {
  const app = Fastify();
  beforeAll(async () => {
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(operationsRoutes);
  });
  afterAll(() => app.close());
  beforeEach(() => vi.resetAllMocks());
  it("reports liveness without calling the database", async () => {
    expect((await app.inject({ url: "/health/live" })).json()).toEqual({
      status: "ok",
    });
    expect(mock.ready).not.toHaveBeenCalled();
  });
  it("returns 503 without leaking readiness errors", async () => {
    mock.ready.mockRejectedValue(new Error("private database details"));
    const response = await app.inject({ url: "/health/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable" });
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it("does not expose support messages without a session", async () => {
    mock.session.mockResolvedValue(null);
    expect((await app.inject({ url: "/admin/feedback" })).statusCode).toBe(401);
    expect(mock.feedback).not.toHaveBeenCalled();
  });
  it("rejects a non-admin using the persisted authorization check", async () => {
    mock.session.mockResolvedValue({ user: { id: "athlete" } });
    mock.feedback.mockRejectedValue(new AdminError("ADMIN_REQUIRED", 403));
    expect((await app.inject({ url: "/admin/feedback" })).statusCode).toBe(403);
  });
});
