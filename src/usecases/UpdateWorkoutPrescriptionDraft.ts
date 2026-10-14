import {
  assertCoachCanPrescribe,
  CoachPrescriptionError,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export interface UpdateWorkoutPrescriptionDraftInput {
  coachId: string;
  prescriptionId: string;
  name: string;
  notes?: string | null;
  workoutDays: Array<{
    name: string;
    order?: number;
    weekDay?: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
    isRest: boolean;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string | null;
    exercises: Array<{
      order: number;
      name: string;
      sets: number;
      warmupSets?: number;
      reps: number;
      restTimeInSeconds: number;
    }>;
  }>;
}

export class UpdateWorkoutPrescriptionDraft {
  async execute(dto: UpdateWorkoutPrescriptionDraftInput) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: dto.coachId,
    });
    assertCoachCanPrescribe(commercialContext);

    const prescription = await prisma.workoutPrescription.findUnique({
      where: { id: dto.prescriptionId },
      include: {
        athlete: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    if (!prescription || prescription.coachId !== dto.coachId) {
      throw new CoachPrescriptionError(
        "PRESCRIPTION_NOT_FOUND",
        404,
        "Prescrição não encontrada.",
      );
    }

    if (prescription.status !== "DRAFT") {
      throw new CoachPrescriptionError(
        "PRESCRIPTION_ALREADY_SENT",
        409,
        "Apenas rascunhos podem ser editados. Prescrições enviadas são imutáveis.",
      );
    }

    // Vínculo ativo obrigatório
    const link = await prisma.coachAthlete.findFirst({
      where: {
        coachId: dto.coachId,
        athleteId: prescription.athleteId,
        status: "ACTIVE",
      },
    });

    if (!link) {
      throw new CoachPrescriptionError(
        "COACH_ATHLETE_LINK_REVOKED",
        403,
        "O vínculo com este aluno foi revogado.",
      );
    }

    const payload = {
      workoutDays: dto.workoutDays.map((day, index) => ({
        name: day.name,
        order: day.order ?? index,
        weekDay: day.weekDay ?? "MONDAY",
        isRest: day.isRest,
        estimatedDurationInSeconds: day.estimatedDurationInSeconds,
        coverImageUrl: day.coverImageUrl ?? null,
        exercises: day.exercises.map((ex, exIndex) => ({
          order: ex.order ?? exIndex,
          name: ex.name,
          sets: ex.sets,
          warmupSets: ex.warmupSets ?? 0,
          reps: ex.reps,
          restTimeInSeconds: ex.restTimeInSeconds,
        })),
      })),
    };

    const updated = await prisma.workoutPrescription.update({
      where: { id: prescription.id },
      data: {
        name: dto.name,
        notes: dto.notes ?? null,
        payload,
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
