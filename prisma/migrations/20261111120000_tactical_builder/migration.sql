ALTER TABLE "user" ADD COLUMN "preferredBuilderMode" TEXT NOT NULL DEFAULT 'tactical';
ALTER TABLE "WorkoutExercise" ADD COLUMN "supersetGroupId" TEXT, ADD COLUMN "runes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "setPrescription" JSONB NOT NULL DEFAULT '[]';
