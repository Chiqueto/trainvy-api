ALTER TABLE "user" ADD COLUMN "coachOnboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "workoutBuilderOnboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isManagedProfile" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CoachInvitation" ADD COLUMN "managedAthleteId" TEXT;
ALTER TABLE "CoachInvitation" ADD CONSTRAINT "CoachInvitation_managedAthleteId_fkey"
FOREIGN KEY ("managedAthleteId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
