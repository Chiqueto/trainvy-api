CREATE TABLE "ExerciseDemonstration" (
  "id" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "youtubeUrl" TEXT,
  "animationKey" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ExerciseDemonstration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExerciseDemonstration_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExerciseDemonstration_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExerciseDemonstration_exerciseId_ownerUserId_key" ON "ExerciseDemonstration"("exerciseId", "ownerUserId");
CREATE INDEX "ExerciseDemonstration_ownerUserId_idx" ON "ExerciseDemonstration"("ownerUserId");
