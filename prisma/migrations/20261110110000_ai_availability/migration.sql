ALTER TYPE "AdminAuditAction" ADD VALUE 'AI_AVAILABILITY_UPDATED';
CREATE TABLE "AiAvailability" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "professionalAiEnabled" BOOLEAN NOT NULL DEFAULT false,
  "athleteAiEnabled" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedByUserId" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiAvailability_pkey" PRIMARY KEY ("id")
);
INSERT INTO "AiAvailability" ("id") VALUES ('global');
