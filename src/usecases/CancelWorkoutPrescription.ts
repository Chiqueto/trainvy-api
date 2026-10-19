import {
  CoachPrescriptionError,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";

export class CancelWorkoutPrescription {
  async execute({
    coachId,
    prescriptionId,
  }: {
    coachId: string;
    prescriptionId: string;
  }) {
    return await prisma.$transaction(
      async (tx) => {
        // Bloqueio pessimista de linha no PostgreSQL para proteger contra concorrência com aceite/recusa
        await tx.$queryRaw`SELECT id FROM "WorkoutPrescription" WHERE id = ${prescriptionId} FOR UPDATE`;

        const prescription = await tx.workoutPrescription.findUnique({
          where: { id: prescriptionId },
          include: {
            athlete: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        });

        if (!prescription || prescription.coachId !== coachId) {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_NOT_FOUND",
            404,
            "Prescrição não encontrada.",
          );
        }

        // Se o aluno já aceitou, o treinador NÃO pode cancelar
        if (prescription.status === "ACCEPTED") {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_ALREADY_ACCEPTED",
            409,
            "Prescrições já aceitas pelo aluno não podem ser canceladas.",
          );
        }

        // Idempotência caso já esteja cancelada
        if (prescription.status === "CANCELLED") {
          return {
            id: prescription.id,
            coachId: prescription.coachId,
            athleteId: prescription.athleteId,
            status: prescription.status,
            name: prescription.name,
            notes: prescription.notes,
            version: prescription.version,
            acceptedWorkoutPlanId: prescription.acceptedWorkoutPlanId,
            sentAt: prescription.sentAt?.toISOString() ?? null,
            respondedAt: prescription.respondedAt?.toISOString() ?? null,
            createdAt: prescription.createdAt.toISOString(),
            updatedAt: prescription.updatedAt.toISOString(),
            athlete: prescription.athlete,
            payload: prescription.payload as unknown as PrescriptionPayload,
          };
        }

        if (prescription.status === "DECLINED") {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_ALREADY_DECLINED",
            409,
            "Esta prescrição já foi recusada pelo aluno.",
          );
        }

        // Permitido apenas de DRAFT ou SENT
        const updated = await tx.workoutPrescription.update({
          where: { id: prescription.id },
          data: {
            status: "CANCELLED",
            respondedAt: new Date(),
          },
          include: {
            athlete: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        });

        return {
          id: updated.id,
          coachId: updated.coachId,
          athleteId: updated.athleteId,
          status: updated.status,
          name: updated.name,
          notes: updated.notes,
          version: updated.version,
          acceptedWorkoutPlanId: updated.acceptedWorkoutPlanId,
          sentAt: updated.sentAt?.toISOString() ?? null,
          respondedAt: updated.respondedAt?.toISOString() ?? null,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
          athlete: updated.athlete,
          payload: updated.payload as unknown as PrescriptionPayload,
        };
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }
}
