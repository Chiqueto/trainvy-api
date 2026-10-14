-- Task 6.1 — Coach ↔ Athlete Foundation

-- 1. ENUMS
CREATE TYPE "CoachAthleteStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "CoachInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- 2. TABELAS
CREATE TABLE "CoachInvitation" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "CoachInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "acceptedAt" TIMESTAMPTZ,
    "acceptedByAthleteId" TEXT,
    "cancelledAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoachAthlete" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "status" "CoachAthleteStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitationId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ,
    "revokedByUserId" TEXT,

    CONSTRAINT "CoachAthlete_pkey" PRIMARY KEY ("id")
);

-- 3. UNICIDADES E ÍNDICES CONVENCIONAIS
CREATE UNIQUE INDEX "CoachInvitation_tokenHash_key" ON "CoachInvitation"("tokenHash");
CREATE UNIQUE INDEX "CoachAthlete_invitationId_key" ON "CoachAthlete"("invitationId");

CREATE INDEX "CoachInvitation_coachId_status_idx" ON "CoachInvitation"("coachId", "status");
CREATE INDEX "CoachInvitation_expiresAt_idx" ON "CoachInvitation"("expiresAt");
CREATE INDEX "CoachInvitation_createdAt_idx" ON "CoachInvitation"("createdAt");

CREATE INDEX "CoachAthlete_coachId_status_idx" ON "CoachAthlete"("coachId", "status");
CREATE INDEX "CoachAthlete_athleteId_status_idx" ON "CoachAthlete"("athleteId", "status");
CREATE INDEX "CoachAthlete_createdAt_idx" ON "CoachAthlete"("createdAt");

-- 4. CHAVES ESTRANGEIRAS
ALTER TABLE "CoachInvitation" ADD CONSTRAINT "CoachInvitation_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachInvitation" ADD CONSTRAINT "CoachInvitation_acceptedByAthleteId_fkey" FOREIGN KEY ("acceptedByAthleteId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CoachAthlete" ADD CONSTRAINT "CoachAthlete_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachAthlete" ADD CONSTRAINT "CoachAthlete_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachAthlete" ADD CONSTRAINT "CoachAthlete_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "CoachInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachAthlete" ADD CONSTRAINT "CoachAthlete_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. ÍNDICES PARCIAIS POSTGRESQL (INVARIANTES RÍGIDAS DE DOMÍNIO)
-- No máximo 1 vínculo ativo de Personal por atleta
CREATE UNIQUE INDEX "CoachAthlete_one_active_coach_per_athlete"
ON "CoachAthlete" ("athleteId")
WHERE "status" = 'ACTIVE';

-- Um treinador e um atleta não podem ter mais de 1 vínculo ativo simultâneo
CREATE UNIQUE INDEX "CoachAthlete_active_pair_unique"
ON "CoachAthlete" ("coachId", "athleteId")
WHERE "status" = 'ACTIVE';

-- 6. CHECK CONSTRAINTS
-- Impedir que o treinador se vincule a si próprio
ALTER TABLE "CoachAthlete" ADD CONSTRAINT "CoachAthlete_no_self_link_check" CHECK (
  "coachId" != "athleteId"
);

-- Vínculo revogado deve possuir data de revogação
ALTER TABLE "CoachAthlete" ADD CONSTRAINT "CoachAthlete_revoked_check" CHECK (
  "status" != 'REVOKED' OR "revokedAt" IS NOT NULL
);
