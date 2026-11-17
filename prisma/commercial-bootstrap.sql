-- Insert-only bootstrap: an existing plan and its entitlements are never overwritten.
WITH inserted AS (
 INSERT INTO "Plan" ("id", "code", "name", "description", "audience", "monthlyPriceInCents", "currency", "isPublic", "isActive", "sortOrder", "updatedAt")
 VALUES
 ('commercial-athlete-free', 'ATHLETE_FREE', 'Atleta Grátis', 'Treinos manuais, registro de séries, histórico e evolução sem mensalidade.', 'ATHLETE', 0, 'BRL', true, true, 0, NOW()),
 ('commercial-coach', 'COACH', 'Personal Essencial', 'Até 20 alunos, fichas e modelos de treino, acompanhamento e estatísticas. Liberação manual nesta fase.', 'COACH', 1990, 'BRL', true, true, 10, NOW()),
 ('commercial-coach-ai', 'COACH_AI', 'Personal Pro', 'Alunos ilimitados, fichas e modelos de treino, acompanhamento e estatísticas. Liberação manual nesta fase.', 'COACH', 3990, 'BRL', true, true, 20, NOW()),
 ('commercial-internal', 'INTERNAL', 'Internal', 'Uso interno, atribuição exclusivamente confiável.', 'INTERNAL', 0, 'BRL', false, true, 100, NOW())
 ON CONFLICT ("code") DO NOTHING RETURNING "id", "code"
),
all_plans AS (
  SELECT "id", "code" FROM inserted
)
INSERT INTO "PlanEntitlement" ("id", "planId", "entitlement", "limitValue")
SELECT p."id" || '-' || e.key, p."id", e.key::"EntitlementKey",
 CASE
   WHEN e.key = 'MANAGE_ATHLETES' THEN CASE p."code" WHEN 'COACH' THEN 20 ELSE NULL END
   ELSE NULL
 END
FROM all_plans p CROSS JOIN (VALUES ('COACH_DASHBOARD'), ('MANAGE_ATHLETES'), ('ASSIGN_WORKOUTS'), ('VIEW_ATHLETE_HISTORY'), ('ADVANCED_STATS')) e(key)
WHERE p."code" IN ('COACH', 'COACH_AI', 'INTERNAL')
   OR (p."code" = 'ATHLETE_FREE' AND e.key = 'ADVANCED_STATS')
ON CONFLICT ("planId", "entitlement") DO NOTHING;
