-- AlterEnum
ALTER TYPE "AdminAuditAction" ADD VALUE 'COMPLIANCE_UPDATED';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "deletedAt" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "WorkoutPlan" ADD COLUMN     "allowStudentSubstitution" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "humanApprovedAt" TIMESTAMPTZ,
ADD COLUMN     "originType" TEXT NOT NULL DEFAULT 'PERSONAL_SELF_LOG',
ADD COLUMN     "prescribedByProfessionalId" TEXT,
ADD COLUMN     "prescribedCrefSnapshot" TEXT,
ADD COLUMN     "prescriptionStatus" TEXT NOT NULL DEFAULT 'APPROVED_PRESCRIBED';

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "biomechanicalReviewStatus" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
ADD COLUMN     "reviewedAt" TIMESTAMPTZ,
ADD COLUMN     "reviewedByCref" TEXT,
ADD COLUMN     "reviewedByProfessionalName" TEXT,
ADD COLUMN     "safetyDisclaimerMd" TEXT;

-- AlterTable
ALTER TABLE "SessionExercise" ADD COLUMN     "substitutedByStudent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkoutPrescription" ADD COLUMN     "allowStudentSubstitution" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "humanApprovedAt" TIMESTAMPTZ,
ADD COLUMN     "originType" TEXT NOT NULL DEFAULT 'PROFESSIONAL_MANUAL',
ADD COLUMN     "prescribedByProfessionalId" TEXT,
ADD COLUMN     "prescribedCrefSnapshot" TEXT,
ADD COLUMN     "prescriptionStatus" TEXT NOT NULL DEFAULT 'DRAFT_MANUAL';

-- AlterTable
ALTER TABLE "ProfessionalRegistration" ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "crefDeclaredAt" TIMESTAMPTZ,
ADD COLUMN     "crefVerificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED_SANDBOX';

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "requiresClickwrap" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_revisions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_compliance_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "legalBasis" TEXT NOT NULL,
    "descriptionMd" TEXT NOT NULL,
    "implementationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "legal_compliance_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_legal_acceptances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentSlug" TEXT NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "acceptedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "user_legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biomechanical_reviews" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "professionalName" TEXT NOT NULL,
    "cref" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "safetyDisclaimerMd" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biomechanical_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_access_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "accessedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "application_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_slug_key" ON "legal_documents"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_revisions_documentId_version_key" ON "legal_document_revisions"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "legal_compliance_items_code_key" ON "legal_compliance_items"("code");

-- CreateIndex
CREATE INDEX "user_legal_acceptances_userId_documentId_documentVersion_idx" ON "user_legal_acceptances"("userId", "documentId", "documentVersion");

-- CreateIndex
CREATE INDEX "user_legal_acceptances_userId_acceptedAt_idx" ON "user_legal_acceptances"("userId", "acceptedAt");

-- CreateIndex
CREATE INDEX "biomechanical_reviews_exerciseId_createdAt_idx" ON "biomechanical_reviews"("exerciseId", "createdAt");

-- CreateIndex
CREATE INDEX "application_access_logs_expiresAt_idx" ON "application_access_logs"("expiresAt");

-- AddForeignKey
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_prescribedByProfessionalId_fkey" FOREIGN KEY ("prescribedByProfessionalId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPrescription" ADD CONSTRAINT "WorkoutPrescription_prescribedByProfessionalId_fkey" FOREIGN KEY ("prescribedByProfessionalId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_revisions" ADD CONSTRAINT "legal_document_revisions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_legal_acceptances" ADD CONSTRAINT "user_legal_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_legal_acceptances" ADD CONSTRAINT "user_legal_acceptances_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve known provenance for legacy imports and accepted professional copies.
UPDATE "WorkoutPlan" SET "originType" = 'IMPORTED_OCR_USER' WHERE "importProvenance" IS NOT NULL;
UPDATE "WorkoutPrescription" SET "prescriptionStatus" = 'APPROVED_PRESCRIBED' WHERE "approvedAt" IS NOT NULL;
UPDATE "WorkoutPlan" w SET "originType" = p."originType", "prescriptionStatus" = 'APPROVED_PRESCRIBED', "prescribedByProfessionalId" = p."coachId", "humanApprovedAt" = p."approvedAt"
FROM "WorkoutPrescription" p WHERE p."acceptedWorkoutPlanId" = w.id AND p."approvedAt" IS NOT NULL;
-- Historical CREF snapshots are deliberately not fabricated from present-day credentials.
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_classification_check" CHECK (classification IN ('OBRIGATORIO_LEI', 'RECOMENDAVEL_RISCO', 'OPCIONAL'));
ALTER TABLE "legal_compliance_items" ADD CONSTRAINT "legal_items_classification_check" CHECK (classification IN ('OBRIGATORIO_LEI', 'RECOMENDAVEL_RISCO', 'OPCIONAL'));
ALTER TABLE "legal_compliance_items" ADD CONSTRAINT "legal_items_status_check" CHECK ("implementationStatus" IN ('IMPLEMENTED', 'PARTIAL', 'PENDING'));
ALTER TABLE "ProfessionalRegistration" ADD CONSTRAINT "cref_compliance_status_check" CHECK ("crefVerificationStatus" IN ('UNVERIFIED_SANDBOX', 'DECLARED_ACTIVE', 'VERIFIED_ADMIN', 'SUSPENDED_FRAUD'));
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "plan_origin_type_check" CHECK ("originType" IN ('PERSONAL_SELF_LOG', 'IMPORTED_OCR_USER', 'PROFESSIONAL_MANUAL', 'PROFESSIONAL_AI_ASSISTED'));
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "plan_prescription_status_check" CHECK ("prescriptionStatus" IN ('DRAFT_AI', 'DRAFT_MANUAL', 'APPROVED_PRESCRIBED'));
ALTER TABLE "WorkoutPrescription" ADD CONSTRAINT "professional_origin_type_check" CHECK ("originType" IN ('PROFESSIONAL_MANUAL', 'PROFESSIONAL_AI_ASSISTED'));
ALTER TABLE "WorkoutPrescription" ADD CONSTRAINT "professional_prescription_status_check" CHECK ("prescriptionStatus" IN ('DRAFT_AI', 'DRAFT_MANUAL', 'APPROVED_PRESCRIBED'));
ALTER TABLE "Exercise" ADD CONSTRAINT "biomechanical_review_status_check" CHECK ("biomechanicalReviewStatus" IN ('PENDING_REVIEW', 'REVIEWED_APPROVED'));
