BEGIN;
CREATE TABLE "WorkoutSessionFeedback" (
  "id" TEXT NOT NULL,
  "workoutSessionId" TEXT NOT NULL,
  "feeling" TEXT NOT NULL,
  "pain" INTEGER,
  "fatigue" INTEGER,
  "sleepQuality" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "WorkoutSessionFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkoutSessionFeedback_feeling_check" CHECK ("feeling" IN ('great', 'energized', 'intense', 'fatigued')),
  CONSTRAINT "WorkoutSessionFeedback_ratings_check" CHECK (
    ("pain" IS NULL OR "pain" BETWEEN 0 AND 10) AND
    ("fatigue" IS NULL OR "fatigue" BETWEEN 0 AND 10) AND
    ("sleepQuality" IS NULL OR "sleepQuality" BETWEEN 0 AND 10)
  )
);
CREATE UNIQUE INDEX "WorkoutSessionFeedback_workoutSessionId_key" ON "WorkoutSessionFeedback"("workoutSessionId");
ALTER TABLE "WorkoutSessionFeedback" ADD CONSTRAINT "WorkoutSessionFeedback_workoutSessionId_fkey"
  FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AiUsageEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "reasoningTokens" INTEGER,
  "cachedInputTokens" INTEGER,
  "estimatedCostUsd" DECIMAL(18,9),
  "inputRate" DECIMAL(12,6) NOT NULL,
  "outputRate" DECIMAL(12,6) NOT NULL,
  "cachedInputRate" DECIMAL(12,6) NOT NULL,
  "pricingVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiUsageEvent_tokens_check" CHECK (
    ("inputTokens" IS NULL OR "inputTokens" >= 0) AND
    ("outputTokens" IS NULL OR "outputTokens" >= 0) AND
    ("reasoningTokens" IS NULL OR "reasoningTokens" >= 0) AND
    ("cachedInputTokens" IS NULL OR "cachedInputTokens" >= 0)
  )
);
CREATE INDEX "AiUsageEvent_createdAt_idx" ON "AiUsageEvent"("createdAt");
CREATE INDEX "AiUsageEvent_userId_createdAt_idx" ON "AiUsageEvent"("userId", "createdAt");
CREATE INDEX "AiUsageEvent_feature_createdAt_idx" ON "AiUsageEvent"("feature", "createdAt");
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
