-- AlterTable
ALTER TABLE "WorkoutPlan" ADD COLUMN "deletedAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Periodization" ADD COLUMN "deletedAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "WorkoutPlan_userId_deletedAt_idx" ON "WorkoutPlan"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Periodization_userId_deletedAt_idx" ON "Periodization"("userId", "deletedAt");
