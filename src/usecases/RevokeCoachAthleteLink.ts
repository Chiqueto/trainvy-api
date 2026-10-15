import { CoachAthleteError } from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";

export class RevokeCoachAthleteLink {
  async execute({
    userId,
    linkId,
  }: {
    userId: string;
    linkId: string;
  }) {
    const link = await prisma.coachAthlete.findUnique({
      where: { id: linkId },
    });

    if (!link) {
      throw new CoachAthleteError(
        "LINK_NOT_FOUND",
        404,
        "Vínculo não encontrado.",
      );
    }

    // Apenas as partes do relacionamento podem revogá-lo
    if (link.coachId !== userId && link.athleteId !== userId) {
      throw new CoachAthleteError(
        "FORBIDDEN",
        403,
        "Você não possui permissão para encerrar este vínculo.",
      );
    }

    if (link.status === "REVOKED") {
      return { success: true, alreadyRevoked: true };
    }

    const updateResult = await prisma.coachAthlete.updateMany({
      where: {
        id: linkId,
        status: "ACTIVE",
      },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedByUserId: userId,
        evolutionShared: false,
        evolutionRevokedAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      return { success: true, alreadyRevoked: true };
    }

    return { success: true, alreadyRevoked: false };
  }
}
