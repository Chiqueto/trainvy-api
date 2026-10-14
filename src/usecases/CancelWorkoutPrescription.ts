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
    const prescription = await prisma.workoutPrescription.findUnique({
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

    if (prescription.status === "ACCEPTED") {
      throw new CoachPrescriptionError(
        "PRESCRIPTION_ALREADY_ACCEPTED",
        409,
        "Prescrições já aceitas pelo aluno não podem ser canceladas.",
      );
    }

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

    const updated = await prisma.workoutPrescription.update({
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
  }
}
