-- CreateEnum
CREATE TYPE "SessionTimePrecision" AS ENUM ('EXACT_TIME', 'DATE_ONLY');

-- CreateEnum
CREATE TYPE "ForgottenWorkoutDraftStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'DISCARDED', 'EXPIRED');

-- AlterTable "WorkoutSession"
ALTER TABLE "WorkoutSession" ADD COLUMN "sessionDate" DATE,
ADD COLUMN "timePrecision" "SessionTimePrecision" NOT NULL DEFAULT 'EXACT_TIME',
ADD COLUMN "isRetroactive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recoveryDraftId" TEXT;

-- CreateTable "ForgottenWorkoutDraft"
CREATE TABLE "ForgottenWorkoutDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "ForgottenWorkoutDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "sessionDate" DATE NOT NULL,
    "timePrecision" "SessionTimePrecision" NOT NULL DEFAULT 'DATE_ONLY',
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "timezone" TEXT NOT NULL,
    "workoutPlanId" TEXT,
    "workoutDayId" TEXT,
    "title" TEXT NOT NULL,
    "origin" "WorkoutSessionOrigin" NOT NULL DEFAULT 'FREE',
    "proposedExercises" JSONB NOT NULL,
    "idempotencyKey" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "discardedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ForgottenWorkoutDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutSession_recoveryDraftId_key" ON "WorkoutSession"("recoveryDraftId");
CREATE INDEX "WorkoutSession_athleteId_sessionDate_idx" ON "WorkoutSession"("athleteId", "sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "ForgottenWorkoutDraft_idempotencyKey_key" ON "ForgottenWorkoutDraft"("idempotencyKey");
CREATE INDEX "ForgottenWorkoutDraft_userId_status_idx" ON "ForgottenWorkoutDraft"("userId", "status");
CREATE INDEX "ForgottenWorkoutDraft_userId_sessionDate_idx" ON "ForgottenWorkoutDraft"("userId", "sessionDate");
CREATE INDEX "ForgottenWorkoutDraft_conversationId_idx" ON "ForgottenWorkoutDraft"("conversationId");

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_recoveryDraftId_fkey" FOREIGN KEY ("recoveryDraftId") REFERENCES "ForgottenWorkoutDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForgottenWorkoutDraft" ADD CONSTRAINT "ForgottenWorkoutDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForgottenWorkoutDraft" ADD CONSTRAINT "ForgottenWorkoutDraft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ForgottenWorkoutDraft" ADD CONSTRAINT "ForgottenWorkoutDraft_workoutPlanId_fkey" FOREIGN KEY ("workoutPlanId") REFERENCES "WorkoutPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ForgottenWorkoutDraft" ADD CONSTRAINT "ForgottenWorkoutDraft_workoutDayId_fkey" FOREIGN KEY ("workoutDayId") REFERENCES "WorkoutDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
