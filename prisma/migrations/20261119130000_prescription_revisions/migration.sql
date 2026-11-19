CREATE TABLE "WorkoutPrescriptionRevision" (
    "prescriptionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "approvedAt" TIMESTAMPTZ,
    "snapshot" JSONB NOT NULL,
    "archivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkoutPrescriptionRevision_pkey" PRIMARY KEY ("prescriptionId", "version"),
    CONSTRAINT "WorkoutPrescriptionRevision_prescriptionId_fkey"
      FOREIGN KEY ("prescriptionId") REFERENCES "WorkoutPrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
