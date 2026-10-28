-- AlterTable
ALTER TABLE "AiUsageEvent" ADD COLUMN "errorMessage" TEXT;

-- CreateIndex
CREATE INDEX "AiUsageEvent_status_createdAt_idx" ON "AiUsageEvent"("status", "createdAt");

