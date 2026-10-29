ALTER TYPE "AdminAuditAction" ADD VALUE 'PROFESSIONAL_VERIFICATION_POLICY_UPDATED';

CREATE TABLE "ProfessionalVerificationPolicy" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "required" BOOLEAN NOT NULL DEFAULT true,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedByUserId" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionalVerificationPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfessionalVerificationPolicy_singleton" CHECK ("id" = 'global')
);

INSERT INTO "ProfessionalVerificationPolicy" ("id", "required") VALUES ('global', true);
