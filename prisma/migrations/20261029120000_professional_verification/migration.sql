-- CreateEnum
CREATE TYPE "ProfessionalVerificationStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'EXPIRED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "WorkoutPlan" ADD COLUMN     "importPreviewHash" TEXT,
ADD COLUMN     "importProvenance" JSONB;

-- AlterTable
ALTER TABLE "WorkoutPrescription" ADD COLUMN     "approvedAt" TIMESTAMPTZ,
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "approvedSnapshot" JSONB,
ADD COLUMN     "approvedVersion" INTEGER;

-- CreateTable
CREATE TABLE "ProfessionalRegistration" (
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "cref" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "ProfessionalVerificationStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "verifiedAt" TIMESTAMPTZ,
    "validUntil" TIMESTAMPTZ,
    "publicReason" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ProfessionalRegistration_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ProfessionalVerificationReview" (
    "registrationSnapshot" JSONB NOT NULL DEFAULT '{}',
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "result" "ProfessionalVerificationStatus" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "identityMatched" BOOLEAN NOT NULL,
    "registrationActive" BOOLEAN NOT NULL,
    "scopeConfirmed" BOOLEAN NOT NULL,
    "checkedAt" TIMESTAMPTZ NOT NULL,
    "validUntil" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalVerificationReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfessionalRegistration_status_updatedAt_idx" ON "ProfessionalRegistration"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ProfessionalVerificationReview_userId_createdAt_idx" ON "ProfessionalVerificationReview"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutPlan_importPreviewHash_key" ON "WorkoutPlan"("importPreviewHash");

-- AddForeignKey
ALTER TABLE "ProfessionalRegistration" ADD CONSTRAINT "ProfessionalRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalVerificationReview" ADD CONSTRAINT "ProfessionalVerificationReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ProfessionalRegistration"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
