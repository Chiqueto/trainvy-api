import {
  CoachPrescriptionError,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";

export class DeclineWorkoutPrescription {
  async execute({
    athleteId,
    prescriptionId,
  }: {
    athleteId: string;
    prescriptionId: string;
  }) {
    return await prisma.$transaction(
      async (tx) => {
        // Bloqueio pessimista de linha no PostgreSQL para serializar recusa, aceite e cancelamento
        await tx.$queryRaw`SELECT id FROM "WorkoutPrescription" WHERE id = ${prescriptionId} FOR UPDATE`;

        const prescription = await tx.workoutPrescription.findUnique({
          where: { id: prescriptionId },
          include: {
            coach: {
              select: { id: true, name: true, image: true },
            },
          },
        });

        if (!prescription || prescription.athleteId !== athleteId) {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_NOT_FOUND",
            404,
            "Prescrição não encontrada.",
          );
        }

        // Idempotência caso já esteja recusada
        if (prescription.status === "DECLINED") {
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
            coach: prescription.coach,
            payload: prescription.payload as unknown as PrescriptionPayload,
          };
        }

        if (prescription.status === "ACCEPTED") {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_ALREADY_ACCEPTED",
            409,
            "Prescrições já aceitas não podem ser recusadas.",
          );
        }

        if (prescription.status === "CANCELLED") {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_ALREADY_CANCELLED",
            409,
            "Prescrição já cancelada pelo treinador.",
          );
        }

        if (prescription.status !== "SENT") {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_NOT_PENDING",
            409,
            `Prescrição não está pendente (status atual: ${prescription.status}).`,
          );
        }

        const updated = await tx.workoutPrescription.update({
          where: { id: prescription.id },
          data: {
            status: "DECLINED",
            respondedAt: new Date(),
          },
          include: {
            coach: {
              select: { id: true, name: true, image: true },
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
          coach: updated.coach,
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
