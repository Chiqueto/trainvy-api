-- Update coach plan copy (remove manual release note) and set Personal Essencial student limit to 10.
BEGIN;
UPDATE "Plan"
SET "description" = 'Até 10 alunos, fichas e modelos de treino, acompanhamento e estatísticas.',
    "updatedAt" = NOW()
WHERE "code" = 'COACH';

UPDATE "Plan"
SET "description" = 'Alunos ilimitados, fichas e modelos de treino, acompanhamento e estatísticas.',
    "updatedAt" = NOW()
WHERE "code" = 'COACH_AI';

UPDATE "PlanEntitlement"
SET "limitValue" = 10
WHERE "entitlement" = 'MANAGE_ATHLETES'
  AND "planId" IN (SELECT "id" FROM "Plan" WHERE "code" = 'COACH');

UPDATE "PlanEntitlement"
SET "limitValue" = NULL
WHERE "entitlement" = 'MANAGE_ATHLETES'
  AND "planId" IN (SELECT "id" FROM "Plan" WHERE "code" = 'COACH_AI');
COMMIT;
