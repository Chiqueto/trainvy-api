import {
  assertAthleteSharingConsent,
  assertCoachCanManageAthletes,
  CoachAthleteError,
  resolveSharingTemporalFloor,
} from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export interface AuthorizedCoachAthleteProgressContext {
  coachId: string;
  athleteId: string;
  linkId: string;
  minCompletedAt?: Date;
  athlete: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

export class AuthorizeCoachAthleteProgressAccess {
  async execute({
    coachId,
    athleteId,
  }: {
    coachId: string;
    athleteId: string;
  }): Promise<AuthorizedCoachAthleteProgressContext> {
    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });

    assertCoachCanManageAthletes(commercialContext);

    const link = await prisma.coachAthlete.findFirst({
      where: {
        coachId,
        athleteId,
        status: "ACTIVE",
      },
      include: {
        athlete: {
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
        "ATHLETE_NOT_FOUND",
        404,
        "Aluno não encontrado ou vínculo inativo com este treinador.",
      );
    }

    assertAthleteSharingConsent(link);

    const minCompletedAt = resolveSharingTemporalFloor(link);

    return {
      coachId,
      athleteId,
      linkId: link.id,
      minCompletedAt,
      athlete: link.athlete,
    };
  }
}
