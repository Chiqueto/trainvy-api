import { prescriptionApprovalMode } from "../domain/prescription-approval.js";
import { PrescriptionPayload } from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";
import {
  assertCoachCanPrescribe,
} from "../domain/coach-prescription.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class ListCoachPrescriptions {
  async execute({
    coachId,
    athleteId,
  }: {
    coachId: string;
    athleteId: string;
  }) {
    assertCoachCanPrescribe(
      await new GetCommercialContext().execute({ userId: coachId }),
    );
    const activeLink = await prisma.coachAthlete.findFirst({ where: { coachId, athleteId, status: "ACTIVE" } });
    const prescriptions = await prisma.workoutPrescription.findMany({
      where: {
        coachId,
        athleteId,
        ...(!activeLink ? { approvedAt: { not: null } } : {}),
      },
      include: {
        athlete: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return prescriptions.map((p) => ({
      id: p.id,
      coachId: p.coachId,
      athleteId: p.athleteId,
      status: p.status,
      originType: p.originType,
      prescriptionStatus: p.prescriptionStatus,
      prescribedCrefSnapshot: p.prescribedCrefSnapshot,
      allowStudentSubstitution: p.allowStudentSubstitution,
      name: p.name,
      notes: p.notes,
      version: p.version,
      approvedByUserId: p.approvedByUserId,
      approvedAt: p.approvedAt?.toISOString() ?? null,
      approvedVersion: p.approvedVersion,
      approvalMode: prescriptionApprovalMode(p),
      acceptedWorkoutPlanId: p.acceptedWorkoutPlanId,
      sentAt: p.sentAt?.toISOString() ?? null,
      respondedAt: p.respondedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      athlete: activeLink ? p.athlete : { ...p.athlete, name: "Vínculo encerrado", email: "", image: null },
      payload: p.payload as unknown as PrescriptionPayload,
    }));
  }
}
