-- Additive taxonomy correction: hip flexion is not hip abduction;
-- ankle dorsiflexion is not plantarflexion (calves).
ALTER TYPE "MuscleGroup" ADD VALUE IF NOT EXISTS 'HIP_FLEXORS';
ALTER TYPE "MuscleGroup" ADD VALUE IF NOT EXISTS 'TIBIALIS_ANTERIOR';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'EXERCISE_MUSCLES_UPDATED';
