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

    const trimmedName = dto.name?.trim();
    if (!trimmedName) {
      throw new CoachPrescriptionError(
        "INVALID_PRESCRIPTION_PAYLOAD",
        400,
        "Nome da prescrição é obrigatório.",
      );
    }

    if (!Array.isArray(dto.workoutDays) || dto.workoutDays.length === 0) {
      throw new CoachPrescriptionError(
        "INVALID_PRESCRIPTION_PAYLOAD",
        400,
        "A prescrição deve conter pelo menos um dia.",
      );
    }

    // Validar dias e exercícios
    for (const [dayIndex, day] of dto.workoutDays.entries()) {
      if (!day.name || !day.name.trim()) {
        throw new CoachPrescriptionError(
          "INVALID_PRESCRIPTION_PAYLOAD",
          400,
          `O dia ${dayIndex + 1} deve ter um nome válido.`,
        );
      }
      if (!day.isRest && Array.isArray(day.exercises)) {
        for (const [exIndex, ex] of day.exercises.entries()) {
          if (!ex.name || !ex.name.trim()) {
            throw new CoachPrescriptionError(
              "INVALID_PRESCRIPTION_PAYLOAD",
              400,
              `O exercício ${exIndex + 1} do dia "${day.name}" deve ter um nome válido.`,
            );
          }
          if (ex.sets < 1 || ex.reps < 1 || ex.restTimeInSeconds < 0) {
            throw new CoachPrescriptionError(
              "INVALID_PRESCRIPTION_PAYLOAD",
              400,
              `Configuração inválida para o exercício "${ex.name}".`,
            );
          }
        }
      }
    }

    // Vínculo ativo obrigatório
    const link = await prisma.coachAthlete.findFirst({
      where: {
        coachId: dto.coachId,
        athleteId: dto.athleteId,
      },
    });

    if (!link) {
      throw new CoachPrescriptionError(
        "COACH_ATHLETE_LINK_NOT_FOUND",
        404,
        "Vínculo com este aluno não foi encontrado.",
      );
    }

    if (link.status !== "ACTIVE") {
      throw new CoachPrescriptionError(
        "COACH_ATHLETE_LINK_REVOKED",
        403,
        "O vínculo com este aluno foi revogado.",
      );
    }

    const payload = {
      workoutDays: dto.workoutDays.map((day, index) => ({
        name: day.name.trim(),
        order: day.order ?? index,
        weekDay: day.weekDay ?? "MONDAY",
        isRest: day.isRest,
        estimatedDurationInSeconds: day.estimatedDurationInSeconds,
        coverImageUrl: day.coverImageUrl ?? null,
        exercises: day.exercises.map((ex, exIndex) => ({
          order: ex.order ?? exIndex,
          name: ex.name.trim(),
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
        name: trimmedName,
        notes: dto.notes ?? null,
        status: "DRAFT",
        version: 1,
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
