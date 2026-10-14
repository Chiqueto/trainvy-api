import {
  assertCoachCanManageAthletes,
  CoachAthleteError,
} from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class GetCoachAthleteDetails {
  async execute({
    coachId,
    athleteId,
  }: {
    coachId: string;
    athleteId: string;
  }) {
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

    return {
      linkId: link.id,
      athleteId: link.athlete.id,
      name: link.athlete.name,
      email: link.athlete.email,
      image: link.athlete.image,
      acceptedAt: link.createdAt.toISOString(),
      status: link.status,
    };
  }
}
