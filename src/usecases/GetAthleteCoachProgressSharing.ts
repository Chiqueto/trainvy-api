import { prisma } from "../lib/db.js";

export interface GetAthleteCoachProgressSharingOutput {
  hasActiveCoach: boolean;
  coach: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  sharingConsent: {
    enabled: boolean;
    includePreviousHistory: boolean;
    sharedAt: string | null;
    revokedAt: string | null;
  } | null;
}

export class GetAthleteCoachProgressSharing {
  async execute({ athleteId }: { athleteId: string }): Promise<GetAthleteCoachProgressSharingOutput> {
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
        hasActiveCoach: false,
        coach: null,
        sharingConsent: null,
      };
    }

    return {
      hasActiveCoach: true,
      coach: {
        id: link.coach.id,
        name: link.coach.name,
        email: link.coach.email,
        image: link.coach.image,
      },
      sharingConsent: {
        enabled: link.evolutionShared,
        includePreviousHistory: link.includePreviousHistory,
        sharedAt: link.evolutionSharedAt ? link.evolutionSharedAt.toISOString() : null,
        revokedAt: link.evolutionRevokedAt ? link.evolutionRevokedAt.toISOString() : null,
      },
    };
  }
}
