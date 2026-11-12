import {
  assertCoachCanManageAthletes,
  CoachAthleteError,
  generateInvitationToken,
  getCoachAthleteLimit,
} from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class CreateCoachInvitation {
  async execute({
    coachId,
    expiresInDays = 7,
    managedAthleteId,
  }: {
    coachId: string;
    expiresInDays?: number;
    managedAthleteId?: string;
  }) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });

    assertCoachCanManageAthletes(commercialContext);

    const limit = getCoachAthleteLimit(commercialContext);
    const activeCount = await prisma.coachAthlete.count({
      where: { coachId, status: "ACTIVE" },
    });

    if (managedAthleteId) {
      const link = await prisma.coachAthlete.findFirst({
        where: {
          coachId,
          athleteId: managedAthleteId,
          status: "ACTIVE",
          athlete: { isManagedProfile: true, deletedAt: null },
        },
      });
      if (!link)
        throw new CoachAthleteError(
          "ATHLETE_NOT_FOUND",
          404,
          "Cadastro de aluno não encontrado.",
        );
    }
    if (
      !managedAthleteId &&
      limit !== null &&
      limit !== undefined &&
      activeCount >= limit
    ) {
      throw new CoachAthleteError(
        "ATHLETE_LIMIT_REACHED",
        409,
        `Você atingiu o limite de ${limit} aluno(s) ativos do seu plano.`,
      );
    }

    const { token, tokenHash } = generateInvitationToken();
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );

    const invitation = await prisma.coachInvitation.create({
      data: {
        coachId,
        managedAthleteId,
        tokenHash,
        status: "PENDING",
        expiresAt,
      },
    });

    return {
      id: invitation.id,
      token,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    };
  }
}
