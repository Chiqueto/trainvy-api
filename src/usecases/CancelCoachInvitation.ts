import {
  assertCoachCanManageAthletes,
  CoachAthleteError,
} from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class CancelCoachInvitation {
  async execute({
    coachId,
    invitationId,
  }: {
    coachId: string;
    invitationId: string;
  }) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });

    assertCoachCanManageAthletes(commercialContext);

    // 1. Transição atômica estrita PENDING -> CANCELLED (evita race condition com aceite simultâneo)
    const updateResult = await prisma.coachInvitation.updateMany({
      where: {
        id: invitationId,
        coachId,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    if (updateResult.count > 0) {
      return { success: true };
    }

    // 2. Se count === 0, investiga deterministamente o motivo da falha
    const invite = await prisma.coachInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invite || invite.coachId !== coachId) {
      throw new CoachAthleteError(
        "INVITATION_NOT_FOUND",
        404,
        "Convite não encontrado.",
      );
    }

    if (invite.status === "CANCELLED") {
      // Idempotência garantida
      return { success: true, alreadyCancelled: true };
    }

    if (invite.status === "ACCEPTED") {
      throw new CoachAthleteError(
        "CANNOT_CANCEL_ACCEPTED_INVITATION",
        400,
        "Não é possível cancelar um convite que já foi aceito.",
      );
    }

    const now = new Date();
    if (invite.expiresAt < now) {
      throw new CoachAthleteError(
        "INVITATION_EXPIRED",
        400,
        "Este convite já expirou.",
      );
    }

    return { success: true };
  }
}
