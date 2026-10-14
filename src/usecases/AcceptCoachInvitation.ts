import {
  assertAthleteCanAcceptInvitation,
  assertCoachCanManageAthletes,
  CoachAthleteError,
  getCoachAthleteLimit,
  hashInvitationToken,
} from "../domain/coach-athlete.js";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

interface ConcurrencyErrorShape {
  name?: string;
  code?: string;
  message?: string;
  cause?: {
    originalCode?: string;
    kind?: string;
  };
  meta?: {
    driverAdapterError?: {
      code?: string;
      cause?: {
        originalCode?: string;
        kind?: string;
      };
    };
    target?: string[];
  };
}

function isRetryableConcurrencyError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as ConcurrencyErrorShape;
  if (e.code === "P2034" || e.code === "40001" || e.code === "40P01") return true;
  if (e.name === "DriverAdapterError" || err.constructor?.name === "DriverAdapterError") return true;
  if (e.cause?.originalCode === "40001" || e.cause?.kind === "TransactionWriteConflict") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  if (
    msg.includes("TransactionWriteConflict") ||
    msg.includes("40001") ||
    msg.includes("could not serialize access") ||
    msg.includes("deadlock detected")
  ) {
    return true;
  }
  if (e.code === "P2010") {
    const driverErr = e.meta?.driverAdapterError;
    if (
      driverErr?.code === "40001" ||
      driverErr?.cause?.originalCode === "40001" ||
      driverErr?.cause?.kind === "TransactionWriteConflict"
    ) {
      return true;
    }
  }
  return false;
}

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

    const tokenHash = hashInvitationToken(token);

    // Validação preliminar fora da transação para fail-fast rápido
    if (athlete.accountSetupCompletedAt === null) {
      throw new CoachAthleteError(
        "ACCOUNT_SETUP_REQUIRED",
        400,
        "Você precisa concluir o cadastro inicial antes de aceitar um convite de treinador.",
      );
    }

    const existingAthleteLink = await prisma.coachAthlete.findFirst({
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

    // Executa em transação Serializable com política de retry controlada contra conflitos de concorrência
    const maxAttempts = 6;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        return await prisma.$transaction(
          async (tx) => {
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

            // Valida elegibilidade do atleta: apenas contas ATHLETE podem ser alunas de um treinador
            assertAthleteCanAcceptInvitation(athlete);

            // 1. Verifica sob transação se o atleta já possui vínculo ativo
            const currentAthleteLink = await tx.coachAthlete.findFirst({
              where: {
                athleteId,
                status: "ACTIVE",
              },
            });

            if (currentAthleteLink) {
              throw new CoachAthleteError(
                "ATHLETE_ALREADY_HAS_COACH",
                409,
                "Você já possui um treinador ativo. Encerre o vínculo existente antes de aceitar um novo convite.",
              );
            }

            // 2. Reavalia o contexto comercial do treinador em tempo real utilizando o cliente transacional
            const coachContext = await new GetCommercialContext().execute({
              userId: invite.coachId,
              now,
              client: tx,
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

            // 3. Transição atômica de status do convite (PENDING -> ACCEPTED)
            const updateCount = await tx.coachInvitation.updateMany({
              where: {
                id: invite.id,
                status: "PENDING",
              },
              data: {
                status: "ACCEPTED",
                acceptedAt: now,
                acceptedByAthleteId: athleteId,
              },
            });

            if (updateCount.count === 0) {
              throw new CoachAthleteError(
                "INVITATION_ALREADY_USED",
                409,
                "Este convite já foi utilizado ou cancelado por outra operação concorrente.",
              );
            }

            // 4. Cria o vínculo ativo
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
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (err: unknown) {
        // Se for erro de domínio conhecido, não deve ser retentado
        if (err instanceof CoachAthleteError) {
          throw err;
        }

        // Trata erro de serialização do PostgreSQL/Prisma com retry exponencial
        if (isRetryableConcurrencyError(err) && attempt < maxAttempts) {
          const jitter = Math.floor(Math.random() * 40) + 10;
          await new Promise((resolve) =>
            setTimeout(resolve, 30 * attempt + jitter),
          );
          continue;
        }

        // Trata violação de restrição única concorrente (P2002)
        const errShape = err as ConcurrencyErrorShape;
        if (errShape.code === "P2002") {
          const target = errShape.meta?.target;
          if (Array.isArray(target) && target.includes("athleteId")) {
            throw new CoachAthleteError(
              "ATHLETE_ALREADY_HAS_COACH",
              409,
              "Você já possui um treinador ativo.",
            );
          }
          if (Array.isArray(target) && target.includes("invitationId")) {
            throw new CoachAthleteError(
              "INVITATION_ALREADY_USED",
              409,
              "Este convite já foi utilizado.",
            );
          }
          throw new CoachAthleteError(
            "CONCURRENT_OPERATION_CONFLICT",
            409,
            "Conflito de concorrência ao processar o vínculo. Tente novamente.",
          );
        }

        if (isRetryableConcurrencyError(err)) {
          throw new CoachAthleteError(
            "CONCURRENT_OPERATION_CONFLICT",
            409,
            "Conflito de concorrência persistente. Tente novamente em instantes.",
          );
        }

        throw err;
      }
    }

    throw new CoachAthleteError(
      "CONCURRENT_OPERATION_CONFLICT",
      409,
      "Conflito de concorrência persistente. Tente novamente em instantes.",
    );
  }
}
