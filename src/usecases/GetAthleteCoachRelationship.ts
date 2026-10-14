import { prisma } from "../lib/db.js";

export class GetAthleteCoachRelationship {
  async execute({ athleteId }: { athleteId: string }) {
    const link = await prisma.coachAthlete.findFirst({
      where: {
        athleteId,
        status: "ACTIVE",
      },
      include: {
        coach: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    if (!link) {
      return {
        hasCoach: false,
        relationship: null,
      };
    }

    return {
      hasCoach: true,
      relationship: {
        linkId: link.id,
        coachId: link.coach.id,
        coachName: link.coach.name,
        coachEmail: link.coach.email,
        coachImage: link.coach.image,
        acceptedAt: link.createdAt.toISOString(),
      },
    };
  }
}
