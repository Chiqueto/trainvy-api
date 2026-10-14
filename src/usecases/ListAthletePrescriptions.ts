import { PrescriptionPayload } from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";

export class ListAthletePrescriptions {
  async execute({ athleteId }: { athleteId: string }) {
    const prescriptions = await prisma.workoutPrescription.findMany({
      where: {
        athleteId,
        status: { in: ["SENT", "ACCEPTED", "DECLINED"] },
      },
      include: {
        coach: {
          select: { id: true, name: true, image: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return prescriptions.map((p) => ({
      id: p.id,
      coachId: p.coachId,
      athleteId: p.athleteId,
      status: p.status,
      name: p.name,
      notes: p.notes,
      version: p.version,
      acceptedWorkoutPlanId: p.acceptedWorkoutPlanId,
      sentAt: p.sentAt?.toISOString() ?? null,
      respondedAt: p.respondedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      coach: p.coach,
      payload: p.payload as unknown as PrescriptionPayload,
    }));
  }
}
