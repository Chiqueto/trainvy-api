import { prescriptionApprovalMode } from "../domain/prescription-approval.js";
import {
  CoachPrescriptionError,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";
import { assertCoachCanPrescribe } from "../domain/coach-prescription.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class GetWorkoutPrescriptionDetails {
  async execute({
    userId,
    prescriptionId,
  }: {
    userId: string;
    prescriptionId: string;
  }) {
    const prescription = await prisma.workoutPrescription.findUnique({
      where: { id: prescriptionId },
      include: {
        coach: {
          select: { id: true, name: true, image: true },
        },
        athlete: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    if (!prescription) {
      throw new CoachPrescriptionError(
        "PRESCRIPTION_NOT_FOUND",
        404,
        "Prescrição não encontrada.",
      );
    }

    const isCoach = prescription.coachId === userId;
    const isAthlete = prescription.athleteId === userId;
    let activeCoachLink = false;
    if (isCoach) {
      assertCoachCanPrescribe(
        await new GetCommercialContext().execute({ userId }),
      );
      const link = await prisma.coachAthlete.findFirst({
        where: {
          coachId: userId,
          athleteId: prescription.athleteId,
          status: "ACTIVE",
        },
      });
      if (!link && !prescription.approvedAt)
        throw new CoachPrescriptionError("PRESCRIPTION_NOT_FOUND", 404);
      activeCoachLink = !!link;
    }

    if (!isCoach && !isAthlete) {
      throw new CoachPrescriptionError(
        "PRESCRIPTION_NOT_FOUND",
        404,
        "Prescrição não encontrada.",
      );
    }

    // Atletas não podem ver prescrições em DRAFT (apenas o treinador autor)
    if (isAthlete && prescription.status === "DRAFT") {
      throw new CoachPrescriptionError(
        "PRESCRIPTION_NOT_FOUND",
        404,
        "Prescrição não encontrada.",
      );
    }

    return {
      id: prescription.id,
      coachId: prescription.coachId,
      athleteId: prescription.athleteId,
      status: prescription.status,
      originType: prescription.originType,
      prescriptionStatus: prescription.prescriptionStatus,
      prescribedCrefSnapshot: prescription.prescribedCrefSnapshot,
      allowStudentSubstitution: prescription.allowStudentSubstitution,
      name: prescription.name,
      notes: prescription.notes,
      version: prescription.version,
      approvedByUserId: prescription.approvedByUserId,
      approvedAt: prescription.approvedAt?.toISOString() ?? null,
      approvedVersion: prescription.approvedVersion,
      approvalMode: prescriptionApprovalMode(prescription),
      acceptedWorkoutPlanId: prescription.acceptedWorkoutPlanId,
      sentAt: prescription.sentAt?.toISOString() ?? null,
      respondedAt: prescription.respondedAt?.toISOString() ?? null,
      createdAt: prescription.createdAt.toISOString(),
      updatedAt: prescription.updatedAt.toISOString(),
      coach: prescription.coach,
      athlete: isCoach ? { ...prescription.athlete, name: activeCoachLink ? prescription.athlete.name : "Vínculo encerrado", email: "", image: null } : prescription.athlete,
      payload: prescription.payload as unknown as PrescriptionPayload,
    };
  }
}
