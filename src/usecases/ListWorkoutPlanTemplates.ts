import {
  assertCoachCanPrescribe,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class ListWorkoutPlanTemplates {
  async execute({ coachId }: { coachId: string }) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });
    assertCoachCanPrescribe(commercialContext);

    const templates = await prisma.workoutPlanTemplate.findMany({
      where: { coachId },
      orderBy: { createdAt: "desc" },
    });

    return templates.map((t) => ({
      id: t.id,
      coachId: t.coachId,
      name: t.name,
      description: t.description,
      payload: t.payload as unknown as PrescriptionPayload,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));
  }
}
