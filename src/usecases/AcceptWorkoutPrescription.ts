import { resolveCanonicalExerciseMap } from "../domain/canonical-exercise.js";
import {
  CoachPrescriptionError,
  PrescriptionDayPayload,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
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
        // 1. Buscar a prescrição e verificar pertencimento
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

        // Idempotência para aceite já concluído
        if (prescription.status === "ACCEPTED" && prescription.acceptedWorkoutPlanId) {
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

        // 2. Verificar se o status atual permite aceite
        if (prescription.status !== "SENT") {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_NOT_PENDING",
            409,
            `Prescrição não está pendente (status atual: ${prescription.status}).`,
          );
        }

        // 3. Verificar se o vínculo Coach-Athlete ainda está ativo
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

        // 4. Bloqueio atômico de concorrência: transicionar de SENT para ACCEPTED
        const updateResult = await tx.workoutPrescription.updateMany({
          where: {
            id: prescription.id,
            status: "SENT",
          },
          data: {
            status: "ACCEPTED",
            respondedAt: new Date(),
          },
        });

        if (updateResult.count === 0) {
          // Outra requisição concorrente já alterou o estado
          const refreshed = await tx.workoutPrescription.findUnique({
            where: { id: prescription.id },
          });

          if (refreshed?.status === "ACCEPTED" && refreshed.acceptedWorkoutPlanId) {
            const plan = await tx.workoutPlan.findUnique({
              where: { id: refreshed.acceptedWorkoutPlanId },
            });
            return {
              success: true,
              prescription: {
                id: refreshed.id,
                coachId: refreshed.coachId,
                athleteId: refreshed.athleteId,
                status: refreshed.status,
                name: refreshed.name,
                notes: refreshed.notes,
                version: refreshed.version,
                acceptedWorkoutPlanId: refreshed.acceptedWorkoutPlanId,
                sentAt: refreshed.sentAt?.toISOString() ?? null,
                respondedAt: refreshed.respondedAt?.toISOString() ?? null,
                createdAt: refreshed.createdAt.toISOString(),
                updatedAt: refreshed.updatedAt.toISOString(),
                coach: prescription.coach,
                payload: refreshed.payload as unknown as PrescriptionPayload,
              },
              workoutPlanId: refreshed.acceptedWorkoutPlanId,
              workoutPlanName: plan?.name ?? refreshed.name,
            };
          }

          throw new CoachPrescriptionError(
            "CONCURRENT_ACCEPTANCE_CONFLICT",
            409,
            "Conflito de concorrência ao aceitar a prescrição. Tente novamente.",
          );
        }

        // 5. Extrair dias e exercícios do payload snapshot
        const rawPayload = prescription.payload as unknown as {
          workoutDays: PrescriptionDayPayload[];
        };
        const workoutDays = rawPayload.workoutDays ?? [];

        // 6. Resolução canônica de exercícios (isolamento por usuário)
        const allExerciseNames = workoutDays.flatMap((day) =>
          day.exercises.map((e) => e.name),
        );
        const canonicalExerciseMap = await resolveCanonicalExerciseMap({
          userId: athleteId,
          names: allExerciseNames,
          tx,
        });

        // 7. Criar o WorkoutPlan de propriedade do ATLETA
        // REQUISITO CRÍTICO: isActive = false (nunca auto-ativar, atleta ativa voluntariamente)
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
                  create: workoutDay.exercises.map((exercise, exIndex) => ({
                    order: exercise.order ?? exIndex,
                    name: exercise.name,
                    sets: exercise.sets,
                    warmupSets: exercise.warmupSets ?? 0,
                    reps: exercise.reps,
                    restTimeInSeconds: exercise.restTimeInSeconds,
                    exerciseId: canonicalExerciseMap.get(exercise.name) ?? null,
                  })),
                },
              })),
            },
          },
        });

        // 8. Vincular o plano gerado à prescrição aceita
        const finalPrescription = await tx.workoutPrescription.update({
          where: { id: prescription.id },
          data: {
            acceptedWorkoutPlanId: newPlan.id,
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
            coach: prescription.coach,
            payload: finalPrescription.payload as unknown as PrescriptionPayload,
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
