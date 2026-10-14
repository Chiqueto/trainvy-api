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

    if (invite.status === "ACCEPTED") {
      throw new CoachAthleteError(
        "CANNOT_CANCEL_ACCEPTED_INVITATION",
        400,
        "Não é possível cancelar um convite que já foi aceito.",
      );
    }

    if (invite.status === "CANCELLED") {
      return { success: true };
    }

    await prisma.coachInvitation.update({
      where: { id: invitationId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    return { success: true };
  }
}
