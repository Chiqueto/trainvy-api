ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'PLAN_CREATED';

ALTER TABLE "user"
  ADD COLUMN "trainingGoals" TEXT,
  ADD COLUMN "experienceLevel" TEXT,
  ADD COLUMN "availableEquipment" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "trainingRestrictions" TEXT;

ALTER TABLE "WorkoutExercise"
  ADD COLUMN "repsMin" INTEGER,
  ADD COLUMN "repsMax" INTEGER,
  ADD COLUMN "targetRir" INTEGER,
  ADD COLUMN "targetLoadInGrams" INTEGER,
  ADD COLUMN "tempo" TEXT,
  ADD CONSTRAINT "WorkoutExercise_range_check" CHECK (("repsMin" IS NULL AND "repsMax" IS NULL) OR
    ("repsMin" IS NOT NULL AND "repsMax" IS NOT NULL AND "repsMin" > 0 AND "repsMax" >= "repsMin")),
  ADD CONSTRAINT "WorkoutExercise_target_check" CHECK (("targetRir" IS NULL OR "targetRir" BETWEEN 0 AND 10) AND
    ("targetLoadInGrams" IS NULL OR "targetLoadInGrams" >= 0));

ALTER TABLE "SessionExercise"
  ADD COLUMN "plannedRepsMin" INTEGER,
  ADD COLUMN "plannedRepsMax" INTEGER,
  ADD COLUMN "plannedTargetRir" INTEGER,
  ADD COLUMN "plannedTargetLoadInGrams" INTEGER,
  ADD COLUMN "plannedTempo" TEXT;
