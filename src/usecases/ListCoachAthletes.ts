import {
  assertCoachCanManageAthletes,
  getCoachAthleteLimit,
} from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class ListCoachAthletes {
  async execute({ coachId }: { coachId: string }) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });

    assertCoachCanManageAthletes(commercialContext);

    const limit = getCoachAthleteLimit(commercialContext);

    const links = await prisma.coachAthlete.findMany({
      where: {
        coachId,
        status: "ACTIVE",
      },
      include: {
        athlete: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      athletes: links.map((link) => ({
        linkId: link.id,
        athleteId: link.athlete.id,
        name: link.athlete.name,
        email: link.athlete.email,
        image: link.athlete.image,
        acceptedAt: link.createdAt.toISOString(),
      })),
      activeCount: links.length,
      limit: limit ?? null,
    };
  }
}
