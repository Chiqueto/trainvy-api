import {
  assertCoachCanPrescribe,
  CoachPrescriptionError,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";
import { effectiveProfessionalStatus } from "../domain/professional-verification.js";
import { prescriptionApprovalMode } from "../domain/prescription-approval.js";

export class SendWorkoutPrescription {
  async execute({
    coachId,
    prescriptionId,
    expectedVersion,
    approval,
  }: {
    coachId: string;
    prescriptionId: string;
    expectedVersion: number;
    approval: true;
  }) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });
    assertCoachCanPrescribe(commercialContext);

    return await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${coachId} FOR UPDATE`;
        const currentContext = await new GetCommercialContext().execute({
          userId: coachId,
          client: tx,
        });
        assertCoachCanPrescribe(currentContext);
        // Bloqueio pessimista de linha no PostgreSQL para serializar envio, cancelamento e edições
        await tx.$queryRaw`SELECT id FROM "WorkoutPrescription" WHERE id = ${prescriptionId} FOR UPDATE`;

        const prescription = await tx.workoutPrescription.findUnique({
          where: { id: prescriptionId },
          include: {
            athlete: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        });

        if (!prescription || prescription.coachId !== coachId) {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_NOT_FOUND",
            404,
            "Prescrição não encontrada.",
          );
        }

        if (approval !== true || !Number.isInteger(expectedVersion))
          throw new CoachPrescriptionError("EXPLICIT_APPROVAL_REQUIRED", 400);
        if (prescription.version !== expectedVersion)
          throw new CoachPrescriptionError(
            "CONCURRENCY_CONFLICT",
            409,
            "A versão revisada foi alterada. Revise novamente antes de aprovar.",
          );

        if (prescription.status === "CANCELLED") {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_ALREADY_CANCELLED",
            409,
            "A prescrição foi cancelada e não pode ser enviada.",
          );
        }

        if (prescription.status !== "DRAFT") {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_NOT_IN_DRAFT",
            409,
            "Apenas rascunhos podem ser enviados ao atleta.",
          );
        }

        // Vínculo ativo obrigatório no momento exato do envio
        await tx.$queryRaw`SELECT id FROM "CoachAthlete" WHERE "coachId" = ${coachId} AND "athleteId" = ${prescription.athleteId} FOR UPDATE`;
        const link = await tx.coachAthlete.findFirst({
          where: {
            coachId,
            athleteId: prescription.athleteId,
            status: "ACTIVE",
          },
        });

        if (!link) {
          throw new CoachPrescriptionError(
            "COACH_ATHLETE_LINK_REVOKED",
            403,
            "O vínculo com este aluno foi revogado. Não é possível enviar a prescrição.",
          );
        }

        // Validação completa do payload snapshot antes do envio
        const rawPayload =
          prescription.payload as unknown as PrescriptionPayload;
        if (!rawPayload?.workoutDays || rawPayload.workoutDays.length === 0) {
          throw new CoachPrescriptionError(
            "INVALID_PRESCRIPTION_PAYLOAD",
            400,
            "A prescrição precisa ter pelo menos um dia de treino para ser enviada.",
          );
        }

        const hasTrainingWithExercises = rawPayload.workoutDays.some(
          (day) => !day.isRest && day.exercises && day.exercises.length > 0,
        );

        if (!hasTrainingWithExercises) {
          throw new CoachPrescriptionError(
            "INVALID_PRESCRIPTION_PAYLOAD",
            400,
            "A prescrição precisa ter pelo menos um dia de treino com exercícios para ser enviada.",
          );
        }

        const updated = await tx.workoutPrescription.update({
          where: { id: prescription.id },
          data: {
            status: "SENT",
            approvedByUserId: coachId,
            approvedAt: new Date(),
            approvedVersion: prescription.version,
            approvedSnapshot: {
              verificationMode:
                effectiveProfessionalStatus(
                  currentContext.professionalVerification,
                ) === "VERIFIED"
                  ? "VERIFIED"
                  : "TEST",
              name: prescription.name,
              notes: prescription.notes,
              payload: prescription.payload,
            },
            sentAt: new Date(),
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
          approvedByUserId: updated.approvedByUserId,
          approvedAt: updated.approvedAt?.toISOString() ?? null,
          approvedVersion: updated.approvedVersion,
          approvalMode: prescriptionApprovalMode(updated),
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
