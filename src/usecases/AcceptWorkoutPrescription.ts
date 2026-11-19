import { buildPrescribedWorkouts } from "../domain/prescribed-workout-data.js";
import {
  CoachPrescriptionError,
  PrescriptionDayPayload,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";
import { prescriptionApprovalMode } from "../domain/prescription-approval.js";
import { readProfessionalVerificationPolicy } from "./ProfessionalVerificationPolicy.js";

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
        const verificationPolicy = await readProfessionalVerificationPolicy(tx);
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

        if (
          !prescription.approvedAt ||
          prescription.approvedByUserId !== prescription.coachId ||
          prescription.approvedVersion !== prescription.version ||
          !prescription.approvedSnapshot
        )
          throw new CoachPrescriptionError(
            "PROFESSIONAL_APPROVAL_REQUIRED",
            403,
            "Esta prescrição não possui aprovação verificável. Peça uma nova versão ao profissional.",
          );

        if (
          prescriptionApprovalMode(prescription) === "TEST" &&
          verificationPolicy.required
        )
          throw new CoachPrescriptionError(
            "TEST_PRESCRIPTION_DISABLED",
            403,
            "Esta aprovação foi feita em modo de testes. Solicite uma nova prescrição revisada pelo profissional verificado.",
          );

        // 3. Verificar se o vínculo Coach-Athlete ainda está ativo no exato momento do aceite
        await tx.$queryRaw`SELECT id FROM "CoachAthlete" WHERE "coachId" = ${prescription.coachId} AND "athleteId" = ${athleteId} FOR UPDATE`;
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

        const workouts = await buildPrescribedWorkouts(
          tx,
          athleteId,
          workoutDays,
        );

        // 6. Criar o WorkoutPlan de propriedade exclusiva do ATLETA
        // REQUISITO CRÍTICO: isActive = false (nunca auto-ativar, preserva planejamento ativo existente)
        const newPlan = await tx.workoutPlan.create({
          data: {
            id: crypto.randomUUID(),
            name: prescription.name,
            originType: prescription.originType,
            prescriptionStatus: "APPROVED_PRESCRIBED",
            prescribedByProfessionalId: prescription.coachId,
            prescribedCrefSnapshot: prescription.prescribedCrefSnapshot,
            humanApprovedAt: prescription.humanApprovedAt,
            allowStudentSubstitution: prescription.allowStudentSubstitution,
            userId: athleteId,
            isActive: false,
            workoutDays: {
              create: workouts.map((workout) => ({
                ...workout.data,
                exercises: { create: workout.exercises },
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
