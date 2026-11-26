import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildSubscriptionCheckoutExternalReference,
  isPaymentFutureAndEditable,
  parseSubscriptionCheckoutExternalReference,
  validCnpj,
  validCpfOrCnpj,
} from "../../src/domain/billing.js";
import { subscriptionGrantsAccess } from "../../src/domain/commercial.js";
import type { Subscription } from "../../src/generated/prisma/client.js";
import { prisma } from "../../src/lib/db.js";
import {
  AsaasClient,
  centsToReais,
  getAsaasBaseUrl,
  reaisToCents,
} from "../../src/services/AsaasClient.js";
import { logAsaasError } from "../../src/services/AsaasErrorLogger.js";
import { verifyAsaasWebhookToken } from "../../src/usecases/billing/ProcessAsaasWebhook.js";

describe("Asaas billing domain & client (offline)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates CPF and CNPJ properly", () => {
    expect(validCpfOrCnpj("52998224725")).toBe(true);
    expect(validCpfOrCnpj("529.982.247-25")).toBe(true);
    expect(validCpfOrCnpj("111.111.111-11")).toBe(false);
    expect(validCpfOrCnpj("12345678900")).toBe(false);

    expect(validCnpj("11222333000181")).toBe(true);
    expect(validCpfOrCnpj("11.222.333/0001-81")).toBe(true);
    expect(validCnpj("11.111.111/1111-11")).toBe(false);
    expect(validCnpj("11222333000182")).toBe(false);
  });

  it("grants access during ASAAS grace period and cancelAtPeriodEnd paid window only", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const future = new Date("2026-11-28T12:00:00Z");
    const past = new Date("2026-11-25T12:00:00Z");

    const base = {
      status: "PAST_DUE",
      billingProvider: "ASAAS",
      currentPeriodStart: null,
      currentPeriodEnd: past,
      trialStartedAt: null,
      trialEndsAt: null,
      graceUntil: future,
      cancelAtPeriodEnd: false,
    } as Subscription;

    expect(subscriptionGrantsAccess(base, now)).toBe(true);
    expect(subscriptionGrantsAccess({ ...base, graceUntil: past }, now)).toBe(
      false,
    );
    expect(
      subscriptionGrantsAccess({ ...base, billingProvider: "NONE" }, now),
    ).toBe(false);

    expect(
      subscriptionGrantsAccess(
        {
          ...base,
          status: "CANCELED",
          cancelAtPeriodEnd: true,
          currentPeriodEnd: future,
        },
        now,
      ),
    ).toBe(true);
    expect(
      subscriptionGrantsAccess(
        {
          ...base,
          status: "CANCELED",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: future,
        },
        now,
      ),
    ).toBe(false);
  });

  it("parses checkout externalReference and checks future editable payments", () => {
    const ref = buildSubscriptionCheckoutExternalReference("sub-123", "plan-456");
    expect(ref).toBe("trainvy:sub:v1:sub-123:plan-456");
    expect(parseSubscriptionCheckoutExternalReference(ref)).toEqual({
      subscriptionId: "sub-123",
      planId: "plan-456",
    });

    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseSubscriptionCheckoutExternalReference(uuid)).toEqual({
      subscriptionId: uuid,
    });
    expect(parseSubscriptionCheckoutExternalReference("invalid")).toBeNull();

    const effectiveAt = new Date("2026-12-01T03:00:00.000Z");
    expect(
      isPaymentFutureAndEditable(
        { id: "pay_1", status: "PENDING", dueDate: "2026-12-01" },
        effectiveAt,
      ),
    ).toBe(true);
    expect(
      isPaymentFutureAndEditable(
        { id: "pay_2", status: "PENDING", dueDate: "2026-11-30" },
        effectiveAt,
      ),
    ).toBe(false);
    expect(
      isPaymentFutureAndEditable(
        { id: "pay_3", status: "RECEIVED", dueDate: "2026-12-05" },
        effectiveAt,
      ),
    ).toBe(false);
  });

  it("validates webhook token in constant time", () => {
    expect(verifyAsaasWebhookToken("secret-token-32-chars-minimum-ok", "secret-token-32-chars-minimum-ok")).toBe(true);
    expect(verifyAsaasWebhookToken("wrong-token", "secret-token-32-chars-minimum-ok")).toBe(false);
    expect(verifyAsaasWebhookToken(undefined, "secret-token-32-chars-minimum-ok")).toBe(false);
    expect(verifyAsaasWebhookToken("any", undefined)).toBe(false);
  });

  it("converts currency cents accurately and selects sandbox/prod URLs", () => {
    expect(centsToReais(1990)).toBe(19.9);
    expect(centsToReais(3990)).toBe(39.9);
    expect(reaisToCents(19.9)).toBe(1990);
    expect(getAsaasBaseUrl("SANDBOX")).toBe("https://api-sandbox.asaas.com");
    expect(getAsaasBaseUrl("PRODUCTION")).toBe("https://api.asaas.com");
  });

  it("logs ONLY errors in asaas_error_logs and sanitizes sensitive tokens (mocked fetch)", async () => {
    const errorLogSpy = vi
      .spyOn(prisma.asaasErrorLog, "create")
      .mockResolvedValue({} as never);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "pl_123",
            url: "https://sandbox.asaas.com/c/pl_123",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errors: [{ code: "invalid_access_token", description: "Invalid" }],
          }),
          { status: 401 },
        ),
      );

    const client = new AsaasClient({
      apiKey: "$aact_hmlg_fake_key_for_unit_test",
      environment: "SANDBOX",
      userAgent: "TrainvyTest",
      successUrl: "https://trainvy.test/personal/assinatura?checkout=success",
    });

    const okResult = await client.createSubscriptionCheckout({
      planName: "Personal Essencial",
      planDescription: "Plano teste",
      monthlyPriceInCents: 1990,
      externalReference: "trainvy:sub:v1:s1:p1",
      userId: "u1",
      subscriptionId: "s1",
    });

    expect(okResult).toEqual({
      checkoutId: "pl_123",
      url: "https://sandbox.asaas.com/c/pl_123",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-sandbox.asaas.com/v3/paymentLinks",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "User-Agent": "TrainvyTest",
          access_token: "$aact_hmlg_fake_key_for_unit_test",
        }),
      }),
    );
    expect(errorLogSpy).not.toHaveBeenCalled();

    const failResult = await client.createSubscriptionCheckout({
      planName: "Personal Essencial",
      planDescription: "Plano teste",
      monthlyPriceInCents: 1990,
      externalReference: "trainvy:sub:v1:s1:p1",
      userId: "u1",
      subscriptionId: "s1",
    });

    expect(failResult).toBeNull();
    expect(errorLogSpy).toHaveBeenCalledTimes(1);

    await logAsaasError({
      processName: "UnitTest.sanitize",
      error: new Error("Failed with $aact_hmlg_secret123456"),
      responseBody: "access_token=abc12345",
    });
    const lastCall = errorLogSpy.mock.calls[1]?.[0];
    expect(lastCall.data.shortMessage).not.toContain("$aact_hmlg_secret123456");
    expect(lastCall.data.responseBody).not.toContain("abc12345");
  });

  it("applies Asaas billing migration SQL cleanly in an isolated rolled-back schema", async () => {
    const commercialMigration = await readFile(
      new URL(
        "../../prisma/migrations/20261007120000_identity_commercial_foundation/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const asaasMigration = await readFile(
      new URL(
        "../../prisma/migrations/20261126150000_asaas_billing_integration/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );

    const rollback = new Error("ROLLBACK_ASAAS_MIGRATION_TEST");
    try {
      await prisma.$transaction(
        async (tx) => {
          const schema = `asaas_test_${crypto.randomUUID().replaceAll("-", "")}`;
          await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
          await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
          await tx.$executeRawUnsafe(
            'CREATE TABLE "user" (id TEXT PRIMARY KEY)',
          );

          for (const statement of commercialMigration
            .replace(/^BEGIN;/, "")
            .replace(/COMMIT;\s*$/, "")
            .split(";")
            .filter((s) => s.trim())) {
            await tx.$executeRawUnsafe(statement);
          }

          for (const statement of asaasMigration
            .replace(/^BEGIN;/, "")
            .replace(/COMMIT;\s*$/, "")
            .split(";")
            .filter((s) => s.trim())) {
            await tx.$executeRawUnsafe(statement);
          }

          const tables = await tx.$queryRawUnsafe<{ tablename: string }[]>(
            `SELECT tablename FROM pg_tables WHERE schemaname = '${schema}'`,
          );
          const names = new Set(tables.map((t) => t.tablename));
          expect(names.has("subscription_payments")).toBe(true);
          expect(names.has("billing_webhook_events")).toBe(true);
          expect(names.has("subscription_refunds")).toBe(true);
          expect(names.has("billing_access_logs")).toBe(true);
          expect(names.has("subscription_upgrades")).toBe(true);
          expect(names.has("subscription_downgrades")).toBe(true);
          expect(names.has("asaas_error_logs")).toBe(true);

          await tx.$executeRawUnsafe(
            `INSERT INTO "asaas_error_logs" ("id", "processName", "errorType", "shortMessage") VALUES ('err-1', 'Test', 'TestError', 'Falha simulada')`,
          );
          const rows = await tx.$queryRawUnsafe<{ count: number }[]>(
            `SELECT count(*)::int AS count FROM "asaas_error_logs"`,
          );
          expect(rows).toEqual([{ count: 1 }]);

          throw rollback;
        },
        { timeout: 20_000 },
      );
    } catch (err) {
      if (err !== rollback) throw err;
    }
  });
});
