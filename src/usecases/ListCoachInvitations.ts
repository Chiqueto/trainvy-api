import { assertCoachCanManageAthletes } from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class ListCoachInvitations {
  async execute({ coachId }: { coachId: string }) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });

    assertCoachCanManageAthletes(commercialContext);

    const now = new Date();
    const invitations = await prisma.coachInvitation.findMany({
      where: { coachId },
      orderBy: { createdAt: "desc" },
    });

    return invitations.map((inv) => {
      let status = inv.status;
      if (status === "PENDING" && inv.expiresAt < now) {
        status = "EXPIRED";
      }

      return {
        id: inv.id,
        status,
        expiresAt: inv.expiresAt.toISOString(),
        createdAt: inv.createdAt.toISOString(),
        acceptedAt: inv.acceptedAt?.toISOString() ?? null,
        cancelledAt: inv.cancelledAt?.toISOString() ?? null,
      };
    });
  }
}
