-- CreateEnum
CREATE TYPE "ExerciseMediaType" AS ENUM ('IMAGE_SEQUENCE', 'GIF', 'VIDEO');

-- CreateTable
CREATE TABLE "ExerciseMedia" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerExerciseId" TEXT NOT NULL,
    "mediaType" "ExerciseMediaType" NOT NULL DEFAULT 'IMAGE_SEQUENCE',
    "startImagePath" TEXT,
    "endImagePath" TEXT,
    "motionPath" TEXT,
    "description" TEXT,
    "instructions" JSONB,
    "attributionName" TEXT NOT NULL DEFAULT 'RepDB',
    "attributionUrl" TEXT NOT NULL DEFAULT 'https://repdb.co',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ExerciseMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseMedia_exerciseId_provider_mediaType_key" ON "ExerciseMedia"("exerciseId", "provider", "mediaType");

-- CreateIndex
CREATE INDEX "ExerciseMedia_exerciseId_isActive_idx" ON "ExerciseMedia"("exerciseId", "isActive");

-- CreateIndex
CREATE INDEX "ExerciseMedia_provider_providerExerciseId_idx" ON "ExerciseMedia"("provider", "providerExerciseId");

-- AddForeignKey
ALTER TABLE "ExerciseMedia" ADD CONSTRAINT "ExerciseMedia_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
