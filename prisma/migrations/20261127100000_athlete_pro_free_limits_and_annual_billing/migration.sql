-- Athlete Free limits, Athlete Pro plan (9,90/mês | 99,90/ano), and Annual billing cycle across Coaches & Athletes

CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

CREATE TYPE "EntitlementKey_new" AS ENUM (
  'COACH_DASHBOARD',
  'MANAGE_ATHLETES',
  'ASSIGN_WORKOUTS',
  'VIEW_ATHLETE_HISTORY',
  'ADVANCED_STATS',
  'AI_CHAT',
  'AI_PLAN_GENERATION',
  'SOURCE_LIBRARY',
  'WORKOUT_PLAN_LIMIT',
  'WORKOUT_DAY_LIMIT',
  'PERIODIZATIONS'
);

ALTER TABLE "PlanEntitlement"
  ALTER COLUMN "entitlement" TYPE "EntitlementKey_new"
  USING ("entitlement"::text::"EntitlementKey_new");

DROP TYPE "EntitlementKey";
ALTER TYPE "EntitlementKey_new" RENAME TO "EntitlementKey";

ALTER TABLE "Plan"
  ADD COLUMN IF NOT EXISTS "annualPriceInCents" INTEGER;

ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE "subscription_payments"
  ADD COLUMN IF NOT EXISTS "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE "subscription_upgrades"
  ADD COLUMN IF NOT EXISTS "fromBillingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS "targetBillingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE "subscription_downgrades"
  ADD COLUMN IF NOT EXISTS "fromBillingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS "targetBillingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';

-- Set annual prices on existing coach plans
UPDATE "Plan"
SET "annualPriceInCents" = 19990, "updatedAt" = NOW()
WHERE "code" = 'COACH' AND "annualPriceInCents" IS NULL;

UPDATE "Plan"
SET "annualPriceInCents" = 39990, "updatedAt" = NOW()
WHERE "code" = 'COACH_AI' AND "annualPriceInCents" IS NULL;

-- Update copy for ATHLETE_FREE to reflect 1 self plan + up to 5 workouts limit cleanly
UPDATE "Plan"
SET
  "description" = '1 plano próprio com até 5 treinos, histórico e evolução. Fichas enviadas pelo seu personal não contam no limite.',
  "updatedAt" = NOW()
WHERE "code" = 'ATHLETE_FREE';

-- Insert ATHLETE_PRO plan (idempotent)
INSERT INTO "Plan" (
  "id",
  "code",
  "name",
  "description",
  "audience",
  "monthlyPriceInCents",
  "annualPriceInCents",
  "currency",
  "isPublic",
  "isActive",
  "sortOrder",
  "updatedAt"
)
VALUES (
  'commercial-athlete-pro',
  'ATHLETE_PRO',
  'Atleta Pro',
  'Planos próprios ilimitados, treinos ilimitados por ficha e periodizações completas.',
  'ATHLETE',
  990,
  9990,
  'BRL',
  true,
  true,
  2,
  NOW()
)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "monthlyPriceInCents" = EXCLUDED."monthlyPriceInCents",
  "annualPriceInCents" = EXCLUDED."annualPriceInCents",
  "isPublic" = true,
  "isActive" = true,
  "updatedAt" = NOW();

-- Free Athlete quantitative limits
INSERT INTO "PlanEntitlement" ("id", "planId", "entitlement", "limitValue")
SELECT p."id" || '-' || e.key, p."id", e.key::"EntitlementKey", e.lim
FROM "Plan" p
CROSS JOIN (
  VALUES
    ('WORKOUT_PLAN_LIMIT', 1),
    ('WORKOUT_DAY_LIMIT', 5)
) e(key, lim)
WHERE p."code" = 'ATHLETE_FREE'
ON CONFLICT ("planId", "entitlement") DO UPDATE SET "limitValue" = EXCLUDED."limitValue";

-- Paid plans & internal: unlimited workout plans, workout days, periodizations & advanced stats
INSERT INTO "PlanEntitlement" ("id", "planId", "entitlement", "limitValue")
SELECT p."id" || '-' || e.key, p."id", e.key::"EntitlementKey", NULL
FROM "Plan" p
CROSS JOIN (
  VALUES
    ('ADVANCED_STATS'),
    ('WORKOUT_PLAN_LIMIT'),
    ('WORKOUT_DAY_LIMIT'),
    ('PERIODIZATIONS')
) e(key)
WHERE p."code" IN ('ATHLETE_PRO', 'COACH', 'COACH_AI', 'INTERNAL')
ON CONFLICT ("planId", "entitlement") DO NOTHING;
