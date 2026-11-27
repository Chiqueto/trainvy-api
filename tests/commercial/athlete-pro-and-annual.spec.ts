import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addBillingCycle,
  resolvePlanPriceInCents,
} from "../../src/domain/billing.js";
import {
  assertCanCreateSelfWorkoutPlan,
  assertCanEditSelfWorkoutPlanDays,
  assertCanUsePeriodizations,
  countTrainingDays,
  isCoachPrescribedWorkoutPlan,
  PlanLimitError,
} from "../../src/domain/planning-limits.js";
import { prisma } from "../../src/lib/db.js";
import { AsaasClient } from "../../src/services/AsaasClient.js";

describe("Athlete Free limits, Athlete Pro, and Annual Billing (offline)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves monthly and yearly prices and adds calendar billing cycles accurately", () => {
    const plan = { monthlyPriceInCents: 990, annualPriceInCents: 9990 };
    expect(resolvePlanPriceInCents(plan, "MONTHLY")).toBe(990);
    expect(resolvePlanPriceInCents(plan, "YEARLY")).toBe(9990);
    expect(
      resolvePlanPriceInCents(
        { monthlyPriceInCents: 0, annualPriceInCents: null },
        "YEARLY",
      ),
    ).toBeNull();

    const jan31 = new Date("2026-01-31T12:00:00.000Z");
    expect(addBillingCycle(jan31, "MONTHLY").toISOString()).toBe(
      "2026-02-28T12:00:00.000Z",
    );
    expect(addBillingCycle(jan31, "YEARLY").toISOString()).toBe(
      "2027-01-31T12:00:00.000Z",
    );
  });

  it("sends YEARLY subscriptionCycle and cycle update payloads to AsaasClient", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ id: "pay_yr_1", url: "https://asaas.test/yr" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new AsaasClient({
      apiKey: "test_key",
      environment: "SANDBOX",
    });
    const checkout = await client.createSubscriptionCheckout({
      planName: "Atleta Pro (Anual)",
      planDescription: "Anual",
      monthlyPriceInCents: 9990,
      billingCycle: "YEARLY",
      externalReference: "trainvy:sub:v1:s1:p1",
      userId: "u1",
      subscriptionId: "s1",
    });

    expect(checkout).toEqual({
      checkoutId: "pay_yr_1",
      url: "https://asaas.test/yr",
    });

    const createPayload = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(createPayload).toMatchObject({
      value: 99.9,
      subscriptionCycle: "YEARLY",
    });

    await client.updateSubscriptionValue(
      "sub_123",
      19990,
      "Personal Essencial (Anual)",
      { userId: "u1", subscriptionId: "s1" },
      "YEARLY",
    );

    const updatePayload = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(updatePayload).toMatchObject({
      value: 199.9,
      cycle: "YEARLY",
    });
  });

  it("distinguishes coach-prescribed plans from athlete self-managed plans", () => {
    expect(
      isCoachPrescribedWorkoutPlan({
        prescribedByProfessionalId: "coach-1",
        originType: "PROFESSIONAL_HUMAN_AUTHORED",
      }),
    ).toBe(true);
    expect(
      isCoachPrescribedWorkoutPlan({
        prescribedByProfessionalId: null,
        originType: "PERSONAL_SELF_LOG",
      }),
    ).toBe(false);
    expect(
      countTrainingDays([
        { isRest: false },
        { isRest: false },
        { isRest: true },
        { isRest: false },
      ]),
    ).toBe(3);
  });

  it("enforces 1 self plan, 5 training days, no periodizations on ATHLETE_FREE while exempting coach plans and unlocking on ATHLETE_PRO", async () => {
    const freePlanEntitlements = [
      { entitlement: "ADVANCED_STATS", limitValue: null },
      { entitlement: "WORKOUT_PLAN_LIMIT", limitValue: 1 },
      { entitlement: "WORKOUT_DAY_LIMIT", limitValue: 5 },
    ];
    const proPlanEntitlements = [
      { entitlement: "ADVANCED_STATS", limitValue: null },
      { entitlement: "WORKOUT_PLAN_LIMIT", limitValue: null },
      { entitlement: "WORKOUT_DAY_LIMIT", limitValue: null },
      { entitlement: "PERIODIZATIONS", limitValue: null },
    ];

    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);

    const makeMockDb = (opts: {
      accountType: "ATHLETE" | "COACH";
      planCode: "ATHLETE_FREE" | "ATHLETE_PRO" | "COACH";
      status: "ACTIVE" | "EXPIRED";
      periodEnd?: Date;
      selfPlansCount: number;
    }) =>
      ({
        user: {
          findUnique: vi.fn().mockResolvedValue({
            accountType: opts.accountType,
            subscription: {
              status: opts.status,
              billingProvider: opts.planCode === "ATHLETE_FREE" ? "NONE" : "ASAAS",
              trialStartedAt: null,
              trialEndsAt: null,
              currentPeriodStart: past,
              currentPeriodEnd: opts.periodEnd ?? future,
              graceUntil: null,
              cancelAtPeriodEnd: false,
              plan: {
                code: opts.planCode,
                entitlements:
                  opts.planCode === "ATHLETE_PRO"
                    ? proPlanEntitlements
                    : freePlanEntitlements,
              },
            },
          }),
        },
        plan: {
          findUnique: vi.fn().mockResolvedValue({
            code: "ATHLETE_FREE",
            entitlements: freePlanEntitlements,
          }),
        },
        workoutPlan: {
          count: vi.fn().mockResolvedValue(opts.selfPlansCount),
        },
      }) as unknown as Parameters<typeof assertCanCreateSelfWorkoutPlan>[0];

    // Free athlete with 0 self plans: 5 training days allowed, 6 blocked
    const freeZero = makeMockDb({
      accountType: "ATHLETE",
      planCode: "ATHLETE_FREE",
      status: "ACTIVE",
      selfPlansCount: 0,
    });
    await expect(
      assertCanCreateSelfWorkoutPlan(freeZero, "ath-1", 5),
    ).resolves.toBeUndefined();
    await expect(
      assertCanCreateSelfWorkoutPlan(freeZero, "ath-1", 6),
    ).rejects.toMatchObject({
      code: "ATHLETE_WORKOUT_DAY_LIMIT_REACHED",
      status: 403,
    });

    // Free athlete with 1 self plan: 2nd self plan blocked
    const freeOne = makeMockDb({
      accountType: "ATHLETE",
      planCode: "ATHLETE_FREE",
      status: "ACTIVE",
      selfPlansCount: 1,
    });
    await expect(
      assertCanCreateSelfWorkoutPlan(freeOne, "ath-1", 3),
    ).rejects.toBeInstanceOf(PlanLimitError);
    await expect(assertCanUsePeriodizations(freeOne, "ath-1")).rejects.toMatchObject({
      code: "PERIODIZATION_REQUIRES_PRO",
      status: 403,
    });

    // Legacy plan with 6 training days stays editable at <=6 days, but cannot increase to 7
    await expect(
      assertCanEditSelfWorkoutPlanDays(
        freeOne,
        "ath-1",
        {
          originType: "PERSONAL_SELF_LOG",
          prescribedByProfessionalId: null,
          workoutDays: Array.from({ length: 6 }, () => ({ isRest: false })),
        },
        6,
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertCanEditSelfWorkoutPlanDays(
        freeOne,
        "ath-1",
        {
          originType: "PERSONAL_SELF_LOG",
          prescribedByProfessionalId: null,
          workoutDays: Array.from({ length: 6 }, () => ({ isRest: false })),
        },
        7,
      ),
    ).rejects.toMatchObject({ code: "ATHLETE_WORKOUT_DAY_LIMIT_REACHED" });

    // Athlete Pro active: unlimited plans, >5 days, periodizations allowed
    const proActive = makeMockDb({
      accountType: "ATHLETE",
      planCode: "ATHLETE_PRO",
      status: "ACTIVE",
      periodEnd: future,
      selfPlansCount: 4,
    });
    await expect(
      assertCanCreateSelfWorkoutPlan(proActive, "ath-1", 7),
    ).resolves.toBeUndefined();
    await expect(assertCanUsePeriodizations(proActive, "ath-1")).resolves.toBeUndefined();

    // Athlete Pro expired falls back seamlessly to Free limits
    const proExpired = makeMockDb({
      accountType: "ATHLETE",
      planCode: "ATHLETE_PRO",
      status: "EXPIRED",
      periodEnd: past,
      selfPlansCount: 1,
    });
    await expect(
      assertCanCreateSelfWorkoutPlan(proExpired, "ath-1", 4),
    ).rejects.toMatchObject({ code: "ATHLETE_PLAN_LIMIT_REACHED" });
    await expect(
      assertCanUsePeriodizations(proExpired, "ath-1"),
    ).rejects.toMatchObject({ code: "PERIODIZATION_REQUIRES_PRO" });
  });

  it("applies annual + athlete Pro SQL migration cleanly in an isolated rolled-back schema", async () => {
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
    const catalogRevision = await readFile(
      new URL(
        "../../prisma/migrations/20261117120000_manual_commercial_catalog/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const coachPlanUpdate = await readFile(
      new URL(
        "../../prisma/migrations/20261126090000_update_coach_plan_limits_and_copy/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const annualMigration = await readFile(
      new URL(
        "../../prisma/migrations/20261127100000_athlete_pro_free_limits_and_annual_billing/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );

    const rollback = new Error("ROLLBACK_ANNUAL_MIGRATION_TEST");
    try {
      await prisma.$transaction(
        async (tx) => {
          const schema = `annual_test_${crypto.randomUUID().replaceAll("-", "")}`;
          await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
          await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
          await tx.$executeRawUnsafe(
            'CREATE TABLE "user" (id TEXT PRIMARY KEY)',
          );

          for (const sql of [
            commercialMigration,
            catalogRevision,
            coachPlanUpdate,
            asaasMigration,
            annualMigration,
          ]) {
            for (const statement of sql
              .replace(/\bBEGIN;/, "")
              .replace(/COMMIT;\s*$/, "")
              .split(";")
              .filter((s) => s.trim())) {
              await tx.$executeRawUnsafe(statement);
            }
          }

          const plans = await tx.$queryRawUnsafe<
            Array<{
              code: string;
              monthlyPriceInCents: number;
              annualPriceInCents: number | null;
            }>
          >(
            `SELECT "code", "monthlyPriceInCents", "annualPriceInCents" FROM "Plan" ORDER BY "code" ASC`,
          );

          expect(plans).toEqual([
            { code: "ATHLETE_FREE", monthlyPriceInCents: 0, annualPriceInCents: null },
            { code: "ATHLETE_PRO", monthlyPriceInCents: 990, annualPriceInCents: 9990 },
            { code: "COACH", monthlyPriceInCents: 1990, annualPriceInCents: 19990 },
            { code: "COACH_AI", monthlyPriceInCents: 3990, annualPriceInCents: 39990 },
            { code: "INTERNAL", monthlyPriceInCents: 0, annualPriceInCents: null },
          ]);

          const freeLimits = await tx.$queryRawUnsafe<
            Array<{ entitlement: string; limitValue: number | null }>
          >(
            `SELECT e."entitlement"::text, e."limitValue"
             FROM "PlanEntitlement" e
             JOIN "Plan" p ON p."id" = e."planId"
             WHERE p."code" = 'ATHLETE_FREE'
             ORDER BY e."entitlement" ASC`,
          );
          expect(freeLimits).toEqual([
            { entitlement: "ADVANCED_STATS", limitValue: null },
            { entitlement: "WORKOUT_PLAN_LIMIT", limitValue: 1 },
            { entitlement: "WORKOUT_DAY_LIMIT", limitValue: 5 },
          ]);

          throw rollback;
        },
        { timeout: 25_000 },
      );
    } catch (err) {
      if (err !== rollback) throw err;
    }
  });
});
