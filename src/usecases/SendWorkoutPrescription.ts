import {
  assertCoachCanPrescribe,
  CoachPrescriptionError,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class SendWorkoutPrescription {
  async execute({
    coachId,
    prescriptionId,
  }: {
    coachId: string;
    prescriptionId: string;
  }) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });
    assertCoachCanPrescribe(commercialContext);

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

    if (prescription.status !== "DRAFT") {
      throw new CoachPrescriptionError(
        "PRESCRIPTION_NOT_IN_DRAFT",
        409,
        "Apenas rascunhos podem ser enviados ao atleta.",
      );
    }

    // Vínculo ativo obrigatório
    const link = await prisma.coachAthlete.findFirst({
      where: {
        coachId,
        athleteId: prescription.athleteId,
        status: "ACTIVE",
      },
    });

    if (!link) {
      throw new CoachPrescriptionError(
        "COACH_ATHLETE_LINK_REVOKED",
        403,
        "O vínculo com este aluno foi revogado. Não é possível enviar a prescrição.",
      );
    }

    const updated = await prisma.workoutPrescription.update({
      where: { id: prescription.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
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
