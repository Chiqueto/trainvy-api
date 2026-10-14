import {
  getCoachAthleteLimit,
  hashInvitationToken,
} from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class GetInvitationPreview {
  async execute({ token }: { token: string }) {
    const tokenHash = hashInvitationToken(token);

    const invite = await prisma.coachInvitation.findUnique({
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
      return {
        isValid: false,
        reason: "NOT_FOUND",
        message: "Convite não encontrado ou token inválido.",
        coach: null,
        expiresAt: null,
      };
    }

    const coachInfo = {
      id: invite.coach.id,
      name: invite.coach.name,
      image: invite.coach.image,
    };

    if (invite.status === "CANCELLED") {
      return {
        isValid: false,
        reason: "CANCELLED",
        message: "Este convite foi cancelado pelo treinador.",
        coach: coachInfo,
        expiresAt: invite.expiresAt.toISOString(),
      };
    }

    if (invite.status === "ACCEPTED") {
      return {
        isValid: false,
        reason: "ALREADY_ACCEPTED",
        message: "Este convite já foi utilizado.",
        coach: coachInfo,
        expiresAt: invite.expiresAt.toISOString(),
      };
    }

    const now = new Date();
    if (invite.expiresAt < now) {
      return {
        isValid: false,
        reason: "EXPIRED",
        message: "Este convite expirou.",
        coach: coachInfo,
        expiresAt: invite.expiresAt.toISOString(),
      };
    }

    // Validação da elegibilidade atual do treinador
    try {
      const coachContext = await new GetCommercialContext().execute({
        userId: invite.coachId,
      });

      const hasManageAthletes = coachContext.entitlements.some(
        (e) => e.key === "MANAGE_ATHLETES",
      );

      if (!hasManageAthletes) {
        return {
          isValid: false,
          reason: "COACH_INACTIVE",
          message: "O treinador não possui um plano ativo no momento.",
          coach: coachInfo,
          expiresAt: invite.expiresAt.toISOString(),
        };
      }

      const limit = getCoachAthleteLimit(coachContext);
      const activeCount = await prisma.coachAthlete.count({
        where: { coachId: invite.coachId, status: "ACTIVE" },
      });

      if (limit !== null && limit !== undefined && activeCount >= limit) {
        return {
          isValid: false,
          reason: "COACH_CAPACITY_FULL",
          message: "O treinador atingiu a capacidade máxima de alunos no plano.",
          coach: coachInfo,
          expiresAt: invite.expiresAt.toISOString(),
        };
      }
    } catch {
      return {
        isValid: false,
        reason: "COACH_INACTIVE",
        message: "Não foi possível validar o plano do treinador.",
        coach: coachInfo,
        expiresAt: invite.expiresAt.toISOString(),
      };
    }

    return {
      isValid: true,
      reason: null,
      message: null,
      coach: coachInfo,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }
}
