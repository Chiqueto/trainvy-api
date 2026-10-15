import { CoachAthleteError } from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";
import type { GetAthleteCoachProgressSharingOutput } from "./GetAthleteCoachProgressSharing.js";

export interface UpdateAthleteCoachProgressSharingInput {
  athleteId: string;
  enabled: boolean;
  includePreviousHistory: boolean;
}

export class UpdateAthleteCoachProgressSharing {
  async execute(input: UpdateAthleteCoachProgressSharingInput): Promise<GetAthleteCoachProgressSharingOutput> {
    const link = await prisma.coachAthlete.findFirst({
      where: {
        athleteId: input.athleteId,
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
      throw new CoachAthleteError(
        "NO_ACTIVE_COACH",
        404,
        "Você não possui um treinador ativo vinculado.",
      );
    }

    const now = new Date();
    const updateData = input.enabled
      ? {
          evolutionShared: true,
          includePreviousHistory: input.includePreviousHistory,
          // Se já estava compartilhado, mantém a data original do consentimento; se acabou de ativar, marca agora
          evolutionSharedAt: link.evolutionShared ? (link.evolutionSharedAt ?? now) : now,
          evolutionRevokedAt: null,
        }
      : {
          evolutionShared: false,
          includePreviousHistory: false,
          evolutionRevokedAt: now,
        };

    const updatedLink = await prisma.coachAthlete.update({
      where: { id: link.id },
      data: updateData,
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

    return {
      hasActiveCoach: true,
      coach: {
        id: updatedLink.coach.id,
        name: updatedLink.coach.name,
        email: updatedLink.coach.email,
        image: updatedLink.coach.image,
      },
      sharingConsent: {
        enabled: updatedLink.evolutionShared,
        includePreviousHistory: updatedLink.includePreviousHistory,
        sharedAt: updatedLink.evolutionSharedAt ? updatedLink.evolutionSharedAt.toISOString() : null,
        revokedAt: updatedLink.evolutionRevokedAt ? updatedLink.evolutionRevokedAt.toISOString() : null,
      },
    };
  }
}
