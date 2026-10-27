import { advancedPrescription } from "../schemas/advanced-prescription.js";
import { resolveCanonicalExerciseMap } from "../domain/canonical-exercise.js";
import {
  CoachPrescriptionError,
  PrescriptionDayPayload,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { sanitizeAndNormalizeAlternatives } from "../domain/exercise-alternatives.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

export class AcceptWorkoutPrescription {
  async execute({
    athleteId,
    prescriptionId,
  }: {
    athleteId: string;
    prescriptionId: string;
  }) {
    return await prisma.$transaction(
      async (tx) => {
        // 1. Bloqueio pessimista de linha no PostgreSQL para serializar aceites concorrentes
        await tx.$queryRaw`SELECT id FROM "WorkoutPrescription" WHERE id = ${prescriptionId} FOR UPDATE`;

        const prescription = await tx.workoutPrescription.findUnique({
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

        // 2. Idempotência perfeita para aceite já concluído
        if (
          prescription.status === "ACCEPTED" &&
          prescription.acceptedWorkoutPlanId
        ) {
          const existingPlan = await tx.workoutPlan.findUnique({
            where: { id: prescription.acceptedWorkoutPlanId },
          });

          return {
            success: true,
            prescription: {
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
            },
            workoutPlanId: prescription.acceptedWorkoutPlanId,
            workoutPlanName: existingPlan?.name ?? prescription.name,
          };
        }

        if (prescription.status === "CANCELLED") {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_ALREADY_CANCELLED",
            409,
            "Esta prescrição foi cancelada pelo treinador.",
          );
        }

        if (prescription.status === "DECLINED") {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_ALREADY_DECLINED",
            409,
            "Esta prescrição foi recusada anteriormente.",
          );
        }

        if (prescription.status !== "SENT") {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_NOT_PENDING",
            409,
            `Prescrição não está pendente (status atual: ${prescription.status}).`,
          );
        }

        // 3. Verificar se o vínculo Coach-Athlete ainda está ativo no exato momento do aceite
        const activeLink = await tx.coachAthlete.findFirst({
          where: {
            coachId: prescription.coachId,
            athleteId,
            status: "ACTIVE",
          },
        });

        if (!activeLink) {
          throw new CoachPrescriptionError(
            "COACH_ATHLETE_LINK_REVOKED",
            403,
            "O vínculo com o treinador foi revogado. Não é possível aceitar a prescrição.",
          );
        }

        // 4. Extrair dias e exercícios do payload snapshot
        const rawPayload = prescription.payload as unknown as {
          workoutDays: PrescriptionDayPayload[];
        };
        const workoutDays = rawPayload.workoutDays ?? [];

        // 5. Resolução canônica de exercícios (isolamento por usuário)
        const allExerciseNames = workoutDays.flatMap((day) =>
          day.exercises.flatMap((e) =>
            [
              e.name,
              e.alternative1ExerciseName,
              e.alternative2ExerciseName,
            ].filter((n): n is string => !!n && n.trim().length > 0),
          ),
        );
        const canonicalExerciseMap = await resolveCanonicalExerciseMap({
          userId: athleteId,
          names: allExerciseNames,
          tx,
        });

        // 6. Criar o WorkoutPlan de propriedade exclusiva do ATLETA
        // REQUISITO CRÍTICO: isActive = false (nunca auto-ativar, preserva planejamento ativo existente)
        const newPlan = await tx.workoutPlan.create({
          data: {
            id: crypto.randomUUID(),
            name: prescription.name,
            userId: athleteId,
            isActive: false,
            workoutDays: {
              create: workoutDays.map((workoutDay, index) => ({
                name: workoutDay.name,
                order: workoutDay.order ?? index,
                weekDay: workoutDay.weekDay ?? WeekDay.MONDAY,
                isRest: workoutDay.isRest,
                estimatedDurationInSeconds:
                  workoutDay.estimatedDurationInSeconds,
                coverImageUrl: workoutDay.coverImageUrl ?? null,
                exercises: {
                  create: workoutDay.exercises.map((exercise, exIndex) => {
                    const resolvedMainId =
                      exercise.exerciseId ??
                      canonicalExerciseMap.get(exercise.name) ??
                      null;

                    const resolvedAlt1Id =
                      exercise.alternative1ExerciseId ??
                      (exercise.alternative1ExerciseName
                        ? canonicalExerciseMap.get(
                            exercise.alternative1ExerciseName,
                          )
                        : null) ??
                      null;

                    const resolvedAlt2Id =
                      exercise.alternative2ExerciseId ??
                      (exercise.alternative2ExerciseName
                        ? canonicalExerciseMap.get(
                            exercise.alternative2ExerciseName,
                          )
                        : null) ??
                      null;

                    const { alternative1ExerciseId, alternative2ExerciseId } =
                      sanitizeAndNormalizeAlternatives({
                        mainExerciseId: resolvedMainId,
                        mainExerciseName: exercise.name,
                        alternative1ExerciseId: resolvedAlt1Id,
                        alternative2ExerciseId: resolvedAlt2Id,
                      });

                    return {
                      order: exercise.order ?? exIndex,
                      name: exercise.name,
                      sets: exercise.sets,
                      warmupSets: exercise.warmupSets ?? 0,
                      reps: exercise.reps,
                      ...advancedPrescription(exercise),
                      restTimeInSeconds: exercise.restTimeInSeconds,
                      exerciseId: resolvedMainId,
                      alternative1ExerciseId,
                      alternative2ExerciseId,
                    };
                  }),
                },
              })),
            },
          },
        });

        // 7. Atualizar a prescrição para ACCEPTED e associar o plano criado
        const finalPrescription = await tx.workoutPrescription.update({
          where: { id: prescription.id },
          data: {
            status: "ACCEPTED",
            acceptedWorkoutPlanId: newPlan.id,
            respondedAt: new Date(),
          },
          include: {
            coach: {
              select: { id: true, name: true, image: true },
            },
          },
        });

        return {
          success: true,
          prescription: {
            id: finalPrescription.id,
            coachId: finalPrescription.coachId,
            athleteId: finalPrescription.athleteId,
            status: finalPrescription.status,
            name: finalPrescription.name,
            notes: finalPrescription.notes,
            version: finalPrescription.version,
            acceptedWorkoutPlanId: finalPrescription.acceptedWorkoutPlanId,
            sentAt: finalPrescription.sentAt?.toISOString() ?? null,
            respondedAt: finalPrescription.respondedAt?.toISOString() ?? null,
            createdAt: finalPrescription.createdAt.toISOString(),
            updatedAt: finalPrescription.updatedAt.toISOString(),
            coach: finalPrescription.coach,
            payload:
              finalPrescription.payload as unknown as PrescriptionPayload,
          },
          workoutPlanId: newPlan.id,
          workoutPlanName: newPlan.name,
        };
      },
      {
        maxWait: 5000,
        timeout: 15000,
      },
    );
  }
}
