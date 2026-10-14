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
    const prescription = await prisma.workoutPrescription.findUnique({
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

    if (prescription.status !== "SENT") {
      throw new CoachPrescriptionError(
        "PRESCRIPTION_NOT_PENDING",
        409,
        `Prescrição não está pendente (status atual: ${prescription.status}).`,
      );
    }

    const updated = await prisma.workoutPrescription.update({
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
  }
}
