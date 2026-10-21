-- CreateEnum
CREATE TYPE "WorkoutSetProposalStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISCARDED', 'INVALIDATED', 'SUPERSEDED');

-- AlterTable "user"
ALTER TABLE "user" ADD COLUMN "aiTrainingHistoryAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiTrainingHistoryConsentAt" TIMESTAMPTZ(6);

-- AlterTable "SessionExercise"
ALTER TABLE "SessionExercise" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable "WorkoutSet"
ALTER TABLE "WorkoutSet" ADD COLUMN "exerciseId" TEXT,
ADD COLUMN "exerciseNameSnapshot" TEXT,
ADD COLUMN "proposalId" TEXT;

-- AlterTable "AiConversation"
ALTER TABLE "AiConversation" ADD COLUMN "workoutSessionId" TEXT;

-- CreateTable "WorkoutSetProposal"
CREATE TABLE "WorkoutSetProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutSessionId" TEXT NOT NULL,
    "sessionExerciseId" TEXT NOT NULL,
    "targetExerciseId" TEXT,
    "targetExerciseNameSnapshot" TEXT NOT NULL,
    "targetSessionExerciseRevision" INTEGER NOT NULL,
    "status" "WorkoutSetProposalStatus" NOT NULL DEFAULT 'PENDING',
    "invalidationReason" TEXT,
    "suggestedSets" JSONB NOT NULL,
    "confirmedSets" JSONB,
    "idempotencyKey" TEXT,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(6),
    "discardedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkoutSetProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutSet_exerciseId_idx" ON "WorkoutSet"("exerciseId");
CREATE INDEX "WorkoutSet_proposalId_idx" ON "WorkoutSet"("proposalId");

-- CreateIndex
CREATE INDEX "AiConversation_workoutSessionId_idx" ON "AiConversation"("workoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutSetProposal_idempotencyKey_key" ON "WorkoutSetProposal"("idempotencyKey");
CREATE INDEX "WorkoutSetProposal_workoutSessionId_status_idx" ON "WorkoutSetProposal"("workoutSessionId", "status");
CREATE INDEX "WorkoutSetProposal_sessionExerciseId_status_idx" ON "WorkoutSetProposal"("sessionExerciseId", "status");
CREATE INDEX "WorkoutSetProposal_userId_status_idx" ON "WorkoutSetProposal"("userId", "status");

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "WorkoutSetProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSetProposal" ADD CONSTRAINT "WorkoutSetProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSetProposal" ADD CONSTRAINT "WorkoutSetProposal_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSetProposal" ADD CONSTRAINT "WorkoutSetProposal_sessionExerciseId_fkey" FOREIGN KEY ("sessionExerciseId") REFERENCES "SessionExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSetProposal" ADD CONSTRAINT "WorkoutSetProposal_targetExerciseId_fkey" FOREIGN KEY ("targetExerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
