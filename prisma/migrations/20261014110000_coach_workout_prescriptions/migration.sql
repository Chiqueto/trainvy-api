-- Task 6.2B — Coach Workout Prescriptions

-- 1. ENUM
CREATE TYPE "WorkoutPrescriptionStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- 2. TABELA
CREATE TABLE "WorkoutPrescription" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "status" "WorkoutPrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "acceptedWorkoutPlanId" TEXT,
    "sentAt" TIMESTAMPTZ,
    "respondedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutPrescription_pkey" PRIMARY KEY ("id")
);

-- 3. UNICIDADES E ÍNDICES
CREATE UNIQUE INDEX "WorkoutPrescription_acceptedWorkoutPlanId_key" ON "WorkoutPrescription"("acceptedWorkoutPlanId");

CREATE INDEX "WorkoutPrescription_coachId_status_idx" ON "WorkoutPrescription"("coachId", "status");
CREATE INDEX "WorkoutPrescription_athleteId_status_idx" ON "WorkoutPrescription"("athleteId", "status");
CREATE INDEX "WorkoutPrescription_createdAt_idx" ON "WorkoutPrescription"("createdAt");

-- 4. CHAVES ESTRANGEIRAS
ALTER TABLE "WorkoutPrescription" ADD CONSTRAINT "WorkoutPrescription_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutPrescription" ADD CONSTRAINT "WorkoutPrescription_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutPrescription" ADD CONSTRAINT "WorkoutPrescription_acceptedWorkoutPlanId_fkey" FOREIGN KEY ("acceptedWorkoutPlanId") REFERENCES "WorkoutPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. CHECK CONSTRAINTS
-- Treinador não pode prescrever para si mesmo
ALTER TABLE "WorkoutPrescription" ADD CONSTRAINT "WorkoutPrescription_no_self_prescription_check" CHECK (
  "coachId" != "athleteId"
);
