-- Task 6.3: Coach Athlete Progress & Training History Consent

ALTER TABLE "CoachAthlete"
  ADD COLUMN "evolutionShared" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "includePreviousHistory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "evolutionSharedAt" TIMESTAMPTZ,
  ADD COLUMN "evolutionRevokedAt" TIMESTAMPTZ;
