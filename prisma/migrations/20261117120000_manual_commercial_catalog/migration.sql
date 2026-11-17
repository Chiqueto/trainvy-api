-- One-time revision of the current catalogue, including custom and internal plans.
-- Stable IDs/codes and subscription price/currency snapshots are preserved.
BEGIN;
DELETE FROM "PlanEntitlement" WHERE "entitlement" IN ('AI_CHAT', 'AI_PLAN_GENERATION');
DELETE FROM "PlanEntitlement" WHERE "entitlement" = 'SOURCE_LIBRARY'
  AND "planId" IN (SELECT "id" FROM "Plan" WHERE "code" IN ('ATHLETE_FREE', 'COACH', 'COACH_AI', 'INTERNAL'));

UPDATE "Plan" SET "name" = 'Atleta Grátis',
  "description" = 'Treinos manuais, registro de séries, histórico e evolução sem mensalidade.',
  "monthlyPriceInCents" = 0, "updatedAt" = NOW() WHERE "code" = 'ATHLETE_FREE';
UPDATE "Plan" SET "name" = 'Personal Essencial',
  "description" = 'Até 20 alunos, fichas e modelos de treino, acompanhamento e estatísticas. Liberação manual nesta fase.',
  "monthlyPriceInCents" = 1990, "updatedAt" = NOW() WHERE "code" = 'COACH';
UPDATE "Plan" SET "name" = 'Personal Pro',
  "description" = 'Alunos ilimitados, fichas e modelos de treino, acompanhamento e estatísticas. Liberação manual nesta fase.',
  "monthlyPriceInCents" = 3990, "updatedAt" = NOW() WHERE "code" = 'COACH_AI';

INSERT INTO "PlanEntitlement" ("id", "planId", "entitlement", "limitValue")
SELECT p."id" || '-manual-' || e.key, p."id", e.key::"EntitlementKey",
  CASE WHEN e.key = 'MANAGE_ATHLETES' AND p."code" = 'COACH' THEN 20 ELSE NULL END
FROM "Plan" p CROSS JOIN (VALUES ('COACH_DASHBOARD'), ('MANAGE_ATHLETES'), ('ASSIGN_WORKOUTS'), ('VIEW_ATHLETE_HISTORY'), ('ADVANCED_STATS')) e(key)
WHERE p."code" IN ('COACH', 'COACH_AI', 'INTERNAL')
   OR (p."code" = 'ATHLETE_FREE' AND e.key = 'ADVANCED_STATS')
ON CONFLICT ("planId", "entitlement") DO UPDATE SET "limitValue" = EXCLUDED."limitValue";
COMMIT;
