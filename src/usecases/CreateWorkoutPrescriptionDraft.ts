import {
  assertCoachCanPrescribe,
  CoachPrescriptionError,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export interface CreateWorkoutPrescriptionDraftInput {
  coachId: string;
  athleteId: string;
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

export class CreateWorkoutPrescriptionDraft {
  async execute(dto: CreateWorkoutPrescriptionDraftInput) {
    if (dto.coachId === dto.athleteId) {
      throw new CoachPrescriptionError(
        "SELF_PRESCRIPTION_NOT_ALLOWED",
        400,
        "Você não pode prescrever treinos para você mesmo.",
      );
    }

    const commercialContext = await new GetCommercialContext().execute({
      userId: dto.coachId,
    });
    assertCoachCanPrescribe(commercialContext);

    // Vínculo ativo obrigatório
    const link = await prisma.coachAthlete.findFirst({
      where: {
        coachId: dto.coachId,
        athleteId: dto.athleteId,
        status: "ACTIVE",
      },
    });

    if (!link) {
      throw new CoachPrescriptionError(
        "COACH_ATHLETE_LINK_NOT_FOUND",
        404,
        "Vínculo ativo com este aluno não foi encontrado.",
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

    const prescription = await prisma.workoutPrescription.create({
      data: {
        coachId: dto.coachId,
        athleteId: dto.athleteId,
        name: dto.name,
        notes: dto.notes ?? null,
        status: "DRAFT",
        payload,
      },
      include: {
        athlete: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

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
}
