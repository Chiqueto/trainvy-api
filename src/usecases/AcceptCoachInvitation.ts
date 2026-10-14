import {
  assertCoachCanManageAthletes,
  CoachAthleteError,
  getCoachAthleteLimit,
  hashInvitationToken,
} from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class AcceptCoachInvitation {
  async execute({
    athleteId,
    token,
  }: {
    athleteId: string;
    token: string;
  }) {
    const athlete = await prisma.user.findUnique({
      where: { id: athleteId },
    });

    if (!athlete) {
      throw new CoachAthleteError("USER_NOT_FOUND", 404, "Usuário não encontrado.");
    }

    if (!athlete.accountSetupCompletedAt) {
      throw new CoachAthleteError(
        "ACCOUNT_SETUP_REQUIRED",
        400,
        "Conclua a configuração inicial do seu perfil antes de aceitar um convite de treinador.",
      );
    }

    const tokenHash = hashInvitationToken(token);

    // Executa em transação para garantir integridade e isolamento de concorrência
    return await prisma.$transaction(async (tx) => {
      const invite = await tx.coachInvitation.findUnique({
        where: { tokenHash },
        include: {
          coach: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });

      if (!invite) {
        throw new CoachAthleteError(
          "INVITATION_NOT_FOUND",
          404,
          "Convite inválido ou inexistente.",
        );
      }

      if (invite.status === "CANCELLED") {
        throw new CoachAthleteError(
          "INVITATION_CANCELLED",
          400,
          "Este convite foi cancelado pelo treinador.",
        );
      }

      if (invite.status === "ACCEPTED") {
        throw new CoachAthleteError(
          "INVITATION_ALREADY_USED",
          409,
          "Este convite já foi utilizado.",
        );
      }

      const now = new Date();
      if (invite.expiresAt < now) {
        throw new CoachAthleteError(
          "INVITATION_EXPIRED",
          400,
          "Este convite expirou.",
        );
      }

      if (invite.coachId === athleteId) {
        throw new CoachAthleteError(
          "CANNOT_LINK_TO_SELF",
          400,
          "Um treinador não pode se vincular como aluno de si próprio.",
        );
      }

      // Verifica se o atleta já possui um treinador ativo
      const existingAthleteLink = await tx.coachAthlete.findFirst({
        where: {
          athleteId,
          status: "ACTIVE",
        },
      });

      if (existingAthleteLink) {
        throw new CoachAthleteError(
          "ATHLETE_ALREADY_HAS_COACH",
          409,
          "Você já possui um treinador ativo. Encerre o vínculo existente antes de aceitar um novo convite.",
        );
      }

      // Valida o plano e a capacidade comercial do treinador
      const coachContext = await new GetCommercialContext().execute({
        userId: invite.coachId,
      });

      assertCoachCanManageAthletes(coachContext);

      const limit = getCoachAthleteLimit(coachContext);
      const activeCount = await tx.coachAthlete.count({
        where: { coachId: invite.coachId, status: "ACTIVE" },
      });

      if (limit !== null && limit !== undefined && activeCount >= limit) {
        throw new CoachAthleteError(
          "ATHLETE_LIMIT_REACHED",
          409,
          "O treinador atingiu a capacidade máxima de alunos permitida no seu plano.",
        );
      }

      // Marca o convite como aceito
      await tx.coachInvitation.update({
        where: { id: invite.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
          acceptedByAthleteId: athleteId,
        },
      });

      // Cria o vínculo ativo
      const link = await tx.coachAthlete.create({
        data: {
          coachId: invite.coachId,
          athleteId,
          status: "ACTIVE",
          invitationId: invite.id,
        },
      });

      return {
        success: true,
        link: {
          id: link.id,
          coachId: link.coachId,
          athleteId: link.athleteId,
          status: link.status,
          createdAt: link.createdAt.toISOString(),
        },
        coach: {
          id: invite.coach.id,
          name: invite.coach.name,
          image: invite.coach.image,
        },
      };
    });
  }
}
