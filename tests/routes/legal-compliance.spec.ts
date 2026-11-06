import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { complianceRoutes } from "../../src/routes/compliance.js";
import {
  contentHash,
  sanitizePayloadForLLM,
  validCpf,
  requiresHealthConsent,
} from "../../src/domain/compliance.js";
import { accessLogExpiry } from "../../src/usecases/ApplicationAccessLogs.js";
import { assertProfessionalAccess } from "../../src/domain/professional-verification.js";
import { isProtectedCpf, maskedStoredCpf } from "../../src/domain/protected-cpf.js";
import {
  SAFETY_REDIRECT,
  safeOrganizerResponse,
} from "../../src/domain/ai-organizer-policy.js";
import {
  LegalCompliance,
  assertHealthConsent,
} from "../../src/usecases/LegalCompliance.js";

const state = vi.hoisted(() => ({
  userId: null as string | null,
  role: "USER",
  accountType: "ATHLETE",
  document: {} as any,
  registration: null as any,
  acceptances: [] as any[],
  revisions: [] as any[],
}));
vi.mock("../../src/lib/auth.js", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.userId ? { user: { id: state.userId } } : null,
    },
  },
}));
vi.mock("../../src/lib/admin-config.js", () => ({
  isConfiguredAdminEmail: () => false,
}));
vi.mock("../../src/lib/db.js", () => {
  const db: any = {
    $queryRaw: vi.fn(async () => []),
    user: {
      findUnique: async () => ({
        id: state.userId,
        email: "test@example.invalid",
        systemRole: state.role,
        accountType: state.accountType,
      }),
      findUniqueOrThrow: async () => ({
        id: state.userId,
        accountType: state.accountType,
        professionalRegistration: state.registration,
      }),
    },
    legalDocument: {
      findUnique: async () => state.document,
      findMany: async () => [state.document],
      update: async ({ data }: any) => Object.assign(state.document, data),
    },
    legalDocumentRevision: {
      create: async ({ data }: any) => {
        state.revisions.push({ ...data });
        return data;
      },
    },
    userLegalAcceptance: {
      findMany: async ({ where }: any) =>
        state.acceptances.filter(
          (a) => a.userId === where.userId && !a.revokedAt,
        ),
      findFirst: async ({ where }: any) =>
        state.acceptances.find(
          (a) =>
            a.userId === where.userId &&
            a.documentId === where.documentId &&
            a.documentVersion === where.documentVersion &&
            !a.revokedAt,
        ) ?? null,
      create: async ({ data }: any) => {
        const a = {
          ...data,
          id: crypto.randomUUID(),
          acceptedAt: new Date(),
          revokedAt: null,
        };
        state.acceptances.push(a);
        return a;
      },
    },
    professionalRegistration: {
      findUnique: async () => state.registration,
      upsert: async ({ create }: any) => {
        state.registration = create;
        return create;
      },
    },
    workoutPlan: { findFirst: async () => null },
    adminAuditLog: { create: async () => ({}) },
  };
  db.$transaction = async (fn: any) => fn(db);
  return { prisma: db };
});

beforeEach(() => {
  state.userId = "user-a";
  state.role = "USER";
  state.accountType = "ATHLETE";
  state.registration = null;
  state.acceptances = [];
  state.revisions = [];
  state.document = {
    id: "document-a",
    slug: "termos-de-uso",
    title: "Termos",
    category: "TERMS_OF_USE",
    targetAudience: "ALL_USERS",
    classification: "OBRIGATORIO_LEI",
    version: "1.0.0",
    contentMd: "# Documento legal original para leitura e aceite",
    requiresClickwrap: true,
    isActive: true,
    updatedAt: new Date(),
  };
});
async function app() {
  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  await server.register(complianceRoutes);
  await server.ready();
  return server;
}
const evidence = { ipAddress: "192.0.2.10", userAgent: "test browser" };
function body() {
  return {
    accepted: true as const,
    version: state.document.version,
    contentHash: contentHash(state.document.contentMd),
  };
}

describe("Legal authorization, consent evidence and governance", () => {
  it("requires session and persisted ADMIN role for governance", async () => {
    const server = await app();
    try {
      state.userId = null;
      expect(
        (await server.inject({ method: "GET", url: "/admin/compliance" }))
          .statusCode,
      ).toBe(401);
      state.userId = "user-a";
      expect(
        (await server.inject({ method: "GET", url: "/admin/compliance" }))
          .statusCode,
      ).toBe(403);
    } finally {
      await server.close();
    }
  });
  it("binds acceptance to authenticated user, version, hash and connection evidence", async () => {
    const service = new LegalCompliance();
    await service.accept("user-a", "termos-de-uso", body(), evidence);
    await service.accept("user-a", "termos-de-uso", body(), evidence);
    expect(state.acceptances).toHaveLength(1);
    expect(state.acceptances[0]).toMatchObject({
      userId: "user-a",
      documentVersion: "1.0.0",
      ...evidence,
    });
    await expect(
      service.accept(
        "user-b",
        "termos-de-uso",
        { ...body(), version: "0.1.0" },
        evidence,
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_VERSION_CHANGED" });
    expect(state.acceptances).toHaveLength(1);
  });
  it("rejects unchecked or forged acceptance at the HTTP boundary", async () => {
    const server = await app();
    try {
      const unchecked = await server.inject({
        method: "POST",
        url: "/me/legal-documents/termos-de-uso/accept",
        payload: { ...body(), accepted: false },
      });
      expect(unchecked.statusCode).toBe(400);
      const forged = await server.inject({
        method: "POST",
        url: "/me/legal-documents/termos-de-uso/accept",
        payload: { ...body(), userId: "victim" },
      });
      expect(forged.statusCode).toBe(400);
      expect(state.acceptances).toHaveLength(0);
    } finally {
      await server.close();
    }
  });
  it("preserves old evidence and revision when publishing new public terms", async () => {
    const service = new LegalCompliance();
    await service.accept("user-a", "termos-de-uso", body(), evidence);
    const previousHash = state.acceptances[0].contentHash;
    state.role = "ADMIN";
    await service.editDocument("admin", "document-a", {
      expectedVersion: "1.0.0",
      title: "Termos atualizados",
      contentMd: "# Nova versão dos termos para leitura e aceite",
    });
    expect(state.document.version).toBe("1.0.1");
    expect(state.revisions[0].version).toBe("1.0.1");
    expect(state.acceptances[0].contentHash).toBe(previousHash);
    expect((await service.documents("user-a"))[0].accepted).toBe(false);
    await expect(
      service.editDocument("admin", "document-a", {
        expectedVersion: "1.0.0",
        title: "Concorrente",
        contentMd: "# Texto concorrente que não pode sobrescrever",
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_VERSION_CHANGED" });
  });
  it("permits reconsent after revocation while retaining the previous audit event", async () => {
    state.document.slug = "termo-saude-parq-lgpd";
    const service = new LegalCompliance();
    await service.accept("user-a", state.document.slug, body(), evidence);
    await expect(assertHealthConsent("user-a")).resolves.toBeUndefined();
    state.acceptances[0].revokedAt = new Date();
    await expect(assertHealthConsent("user-a")).rejects.toMatchObject({
      code: "HEALTH_CONSENT_REQUIRED",
    });
    await service.accept("user-a", state.document.slug, body(), evidence);
    expect(state.acceptances).toHaveLength(2);
    expect(state.acceptances[0].revokedAt).not.toBeNull();
    await expect(assertHealthConsent("user-a")).resolves.toBeUndefined();
  });
  it("activates a declared coach with validated CPF and logs only masked CPF metadata", async () => {
    state.accountType = "COACH";
    state.document.slug = "declaracao-responsabilidade-cref";
    state.document.targetAudience = "PROFESSIONAL";
    await new LegalCompliance().declare(
      "user-a",
      {
        fullName: "Profissional Teste",
        cpf: "52998224725",
        cref: "123456-G",
        region: "SP",
        category: "Bacharel",
        acceptance: body(),
      },
      evidence,
    );
    expect(state.registration.crefVerificationStatus).toBe("DECLARED_ACTIVE");
    expect(isProtectedCpf(state.registration.cpf)).toBe(true);
    expect(state.registration.cpf).not.toContain("52998224725");
    expect(maskedStoredCpf(state.registration.cpf)).toBe("***.***.***-25");
    expect(state.acceptances[0].metadataJson).toEqual({
      cref_informed: "123456-G/SP",
      cpf_informed: "***",
    });
    expect(() =>
      assertProfessionalAccess({
        status: "PENDING_VERIFICATION",
        validUntil: null,
        crefVerificationStatus: state.registration.crefVerificationStatus,
      }),
    ).not.toThrow();
  });
  it("does not let a suspended coach self-declare to bypass administrative review", async () => {
    state.accountType = "COACH";
    state.registration = {
      status: "SUSPENDED",
      crefVerificationStatus: "SUSPENDED_FRAUD",
    };
    await expect(
      new LegalCompliance().declare(
        "user-a",
        {
          fullName: "Profissional Teste",
          cpf: "52998224725",
          cref: "123456-G",
          region: "SP",
          category: "Bacharel",
          acceptance: body(),
        },
        evidence,
      ),
    ).rejects.toMatchObject({ code: "PROFESSIONAL_SUSPENDED" });
    expect(state.acceptances).toHaveLength(0);
    expect(() =>
      assertProfessionalAccess(
        {
          status: "SUSPENDED",
          validUntil: null,
          crefVerificationStatus: "DECLARED_ACTIVE",
        },
        false,
      ),
    ).toThrow();
    expect(() => assertProfessionalAccess(null, false)).toThrow();
  });
  it("does not accept administrative documents through public clickwrap", async () => {
    state.document.targetAudience = "ADMIN_ONLY";
    await expect(
      new LegalCompliance().accept(
        "user-a",
        "matriz-compliance-trainvy",
        body(),
        evidence,
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
  });
  it("rejects invalid CPF verifier digits and repeated numbers", () => {
    expect(validCpf("529.982.247-25")).toBe(true);
    expect(validCpf("52998224726")).toBe(false);
    expect(validCpf("11111111111")).toBe(false);
  });
  it("requires health consent for writes while keeping privacy rights and legal acknowledgement accessible", () => {
    expect(requiresHealthConsent("POST", "/workout-plans/")).toBe(true);
    expect(
      requiresHealthConsent("PATCH", "/workout-sessions/123/sets/456"),
    ).toBe(true);
    expect(requiresHealthConsent("PATCH", "/me/sports-profile")).toBe(true);
    expect(requiresHealthConsent("POST", "/me/privacy/revoke-health")).toBe(
      false,
    );
    expect(
      requiresHealthConsent("POST", "/me/legal-documents/termos-de-uso/accept"),
    ).toBe(false);
    expect(requiresHealthConsent("GET", "/history")).toBe(false);
  });
  it("expires application access logs after six calendar months, clamping the last day", () => {
    expect(
      accessLogExpiry(new Date("2026-08-31T12:30:00Z")).toISOString(),
    ).toBe("2027-02-28T12:30:00.000Z");
    expect(
      accessLogExpiry(new Date("2026-11-06T12:30:00Z")).toISOString(),
    ).toBe("2027-05-06T12:30:00.000Z");
  });
  it("removes nested structured PII, serialized JSON, known names and free-text contacts without mutating input", () => {
    const input = {
      full_name: "Maria Teste",
      email: "maria@example.com",
      technical: { cpf: "52998224725", objetivo: "força", sets: 3 },
      nested: [{ phone: "11988887777", exerciseName: "Supino" }],
    };
    expect(sanitizePayloadForLLM(input)).toEqual({
      technical: { objetivo: "força", sets: 3 },
      nested: [{ exerciseName: "Supino" }],
    });
    expect(input.full_name).toBe("Maria Teste");
    expect(sanitizePayloadForLLM(JSON.stringify(input))).not.toContain(
      "maria@example.com",
    );
    expect(
      sanitizePayloadForLLM(
        "Maria Teste, maria@example.com, CPF 529.982.247-25",
        ["Maria Teste"],
      ),
    ).not.toMatch(/Maria|example|529/);
  });
  it.each([
    "Estou com dor aguda",
    "Tive tontura",
    "Tenho uma lesão",
    "Reabilitação de hérnia",
  ])("interrupts training suggestions for %s", (input) => {
    expect(safeOrganizerResponse("Faça 3x10", input)).toBe(SAFETY_REDIRECT);
  });
});
