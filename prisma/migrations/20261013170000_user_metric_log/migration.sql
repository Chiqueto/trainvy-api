-- CreateTable
CREATE TABLE "user_metric_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weightInGrams" INTEGER NOT NULL,
    "heightInCentimeters" INTEGER,
    "age" INTEGER,
    "bodyFatPercentage" INTEGER,
    "loggedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_metric_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_metric_log_userId_loggedAt_idx" ON "user_metric_log"("userId", "loggedAt" DESC);

-- CreateIndex
CREATE INDEX "user_metric_log_createdAt_idx" ON "user_metric_log"("createdAt");

-- AddForeignKey
ALTER TABLE "user_metric_log" ADD CONSTRAINT "user_metric_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill initial log from existing users with weightInGrams
INSERT INTO "user_metric_log" ("id", "userId", "weightInGrams", "heightInCentimeters", "age", "bodyFatPercentage", "loggedAt", "createdAt")
SELECT
    gen_random_uuid()::text,
    "id",
    "weightInGrams",
    "heightInCentimeters",
    "age",
    "bodyFatPercentage",
    COALESCE("accountSetupCompletedAt", "updatedAt", "createdAt", CURRENT_TIMESTAMP),
    COALESCE("accountSetupCompletedAt", "updatedAt", "createdAt", CURRENT_TIMESTAMP)
FROM "user"
WHERE "weightInGrams" IS NOT NULL;
