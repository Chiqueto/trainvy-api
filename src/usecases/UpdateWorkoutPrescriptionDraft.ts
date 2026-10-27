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
  expectedVersion?: number;
  workoutDays: Array<{
    name: string;
    order?: number;
    weekDay?:
      | "MONDAY"
      | "TUESDAY"
      | "WEDNESDAY"
      | "THURSDAY"
      | "FRIDAY"
      | "SATURDAY"
      | "SUNDAY";
    isRest: boolean;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string | null;
    exercises: Array<{
      order: number;
      name: string;
      alternative1ExerciseName?: string | null;
      alternative2ExerciseName?: string | null;
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
          alternative1ExerciseName: ex.alternative1ExerciseName?.trim() || null,
          alternative2ExerciseName: ex.alternative2ExerciseName?.trim() || null,
          sets: ex.sets,
          warmupSets: ex.warmupSets ?? 0,
          reps: ex.reps,
          restTimeInSeconds: ex.restTimeInSeconds,
        })),
      })),
    };

    return await prisma.$transaction(
      async (tx) => {
        // Bloqueio pessimista de linha no PostgreSQL para serializar edições e envios
        await tx.$queryRaw`SELECT id FROM "WorkoutPrescription" WHERE id = ${dto.prescriptionId} FOR UPDATE`;

        const prescription = await tx.workoutPrescription.findUnique({
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
            "Apenas rascunhos podem ser editados. Prescrições enviadas ou canceladas são imutáveis.",
          );
        }

        // Controle de versão otimista quando fornecido
        if (
          dto.expectedVersion !== undefined &&
          prescription.version !== dto.expectedVersion
        ) {
          throw new CoachPrescriptionError(
            "CONCURRENCY_CONFLICT",
            409,
            "Esta prescrição foi alterada por outra operação. Recarregue os dados e tente novamente.",
          );
        }

        // Vínculo ativo obrigatório no momento da edição
        const link = await tx.coachAthlete.findFirst({
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

        const updated = await tx.workoutPrescription.update({
          where: { id: prescription.id },
          data: {
            name: trimmedName,
            notes: dto.notes ?? null,
            payload,
            version: { increment: 1 },
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
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }
}
