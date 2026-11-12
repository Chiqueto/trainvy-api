import { CoachAthleteError } from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";

const select = {
  coachOnboardingCompleted: true,
  workoutBuilderOnboardingCompleted: true,
} as const;
export class CoachOnboarding {
  async execute({
    userId,
    tour,
  }: {
    userId: string;
    tour?: "workspace" | "builder";
  }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { accountType: true, ...select },
    });
    if (!user || user.accountType !== "COACH")
      throw new CoachAthleteError(
        "ONLY_COACHES_ALLOWED",
        403,
        "Guia disponível apenas para personais.",
      );
    if (!tour)
      return {
        coachOnboardingCompleted: user.coachOnboardingCompleted,
        workoutBuilderOnboardingCompleted:
          user.workoutBuilderOnboardingCompleted,
      };
    return prisma.user.update({
      where: { id: userId },
      data:
        tour === "workspace"
          ? { coachOnboardingCompleted: true }
          : { workoutBuilderOnboardingCompleted: true },
      select,
    });
  }
}
