-- AlterTable
ALTER TABLE "WorkoutExercise" ADD COLUMN "alternative1ExerciseId" TEXT,
ADD COLUMN "alternative2ExerciseId" TEXT;

-- AlterTable
ALTER TABLE "SessionExercise" ADD COLUMN "plannedExerciseId" TEXT,
ADD COLUMN "plannedExerciseNameSnapshot" TEXT,
ADD COLUMN "alternative1ExerciseId" TEXT,
ADD COLUMN "alternative1ExerciseNameSnapshot" TEXT,
ADD COLUMN "alternative2ExerciseId" TEXT,
ADD COLUMN "alternative2ExerciseNameSnapshot" TEXT,
ADD COLUMN "wasSubstituted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "substitutedAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "WorkoutExercise_alternative1ExerciseId_idx" ON "WorkoutExercise"("alternative1ExerciseId");

-- CreateIndex
CREATE INDEX "WorkoutExercise_alternative2ExerciseId_idx" ON "WorkoutExercise"("alternative2ExerciseId");

-- CreateIndex
CREATE INDEX "SessionExercise_plannedExerciseId_idx" ON "SessionExercise"("plannedExerciseId");

-- CreateIndex
CREATE INDEX "SessionExercise_alternative1ExerciseId_idx" ON "SessionExercise"("alternative1ExerciseId");

-- CreateIndex
CREATE INDEX "SessionExercise_alternative2ExerciseId_idx" ON "SessionExercise"("alternative2ExerciseId");

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_alternative1ExerciseId_fkey" FOREIGN KEY ("alternative1ExerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_alternative2ExerciseId_fkey" FOREIGN KEY ("alternative2ExerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExercise" ADD CONSTRAINT "SessionExercise_plannedExerciseId_fkey" FOREIGN KEY ("plannedExerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExercise" ADD CONSTRAINT "SessionExercise_alternative1ExerciseId_fkey" FOREIGN KEY ("alternative1ExerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionExercise" ADD CONSTRAINT "SessionExercise_alternative2ExerciseId_fkey" FOREIGN KEY ("alternative2ExerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
