import {
  assertCoachCanPrescribe,
  CoachPrescriptionError,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { resolvePrescriptionCatalogReferences } from "../domain/prescription-catalog.js";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { syncAcceptedPrescriptionPlan } from "../domain/sync-accepted-prescription-plan.js";
import { prescriptionApprovalMode } from "../domain/prescription-approval.js";
import { advancedPrescription } from "../schemas/advanced-prescription.js";
import type { TacticalFields } from "../schemas/tactical-builder.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export interface UpdateWorkoutPrescriptionDraftInput {
  allowStudentSubstitution?: boolean;
  coachId: string;
  prescriptionId: string;
  name: string;
  notes?: string | null;
  expectedVersion?: number;
  approval?: true;
  workoutDays: Array<{
    id?: string;
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
      id?: string;
      order: number;
      name: string;
      exerciseId?: string | null;
      alternative1ExerciseId?: string | null;
      alternative2ExerciseId?: string | null;
      alternative1ExerciseName?: string | null;
      alternative2ExerciseName?: string | null;
      sets: number;
      warmupSets?: number;
      reps: number;
      repsMin?: number | null;
      repsMax?: number | null;
      targetRir?: number | null;
      targetLoadInGrams?: number | null;
      tempo?: string | null;
      supersetGroupId?: string | null;
      runes?: TacticalFields["runes"];
      runeConfig?: TacticalFields["runeConfig"];
      setPrescription?: TacticalFields["setPrescription"];
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

    return await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${dto.coachId} FOR UPDATE`;
        assertCoachCanPrescribe(
          await new GetCommercialContext().execute({
            userId: dto.coachId,
            client: tx,
          }),
        );
        if (dto.approval) {
          // Older accepted plans can still be editable by the student, who locks the plan first.
          await tx.$queryRaw`
            SELECT plan.id
            FROM "WorkoutPlan" plan
            JOIN "WorkoutPrescription" p
              ON p."acceptedWorkoutPlanId" = plan.id AND p."athleteId" = plan."userId"
            WHERE p.id = ${dto.prescriptionId} AND p."coachId" = ${dto.coachId}
              AND p.status = 'ACCEPTED'
            FOR UPDATE OF plan
          `;
        }
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

        const published =
          prescription.status === "SENT" || prescription.status === "ACCEPTED";
        if (prescription.status !== "DRAFT" && !published) {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_ALREADY_SENT",
            409,
            "Esta prescrição não pode mais ser editada.",
          );
        }
        if (
          published &&
          (dto.approval !== true || dto.expectedVersion === undefined)
        ) {
          throw new CoachPrescriptionError(
            "PRESCRIPTION_ALREADY_SENT",
            409,
            "Revise e aprove a nova versão da prescrição antes de publicar.",
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
        await tx.$queryRaw`SELECT id FROM "CoachAthlete" WHERE "coachId" = ${dto.coachId} AND "athleteId" = ${prescription.athleteId} FOR UPDATE`;
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

        const catalogReference = await resolvePrescriptionCatalogReferences({
          coachId: dto.coachId,
          exercises: dto.workoutDays
            .filter((day) => !day.isRest)
            .flatMap((day) => day.exercises),
          client: tx,
        });
        const payload = {
          workoutDays: dto.workoutDays.map((day, index) => ({
            name: day.name.trim(),
            order: published ? index : (day.order ?? index),
            weekDay: day.weekDay ?? "MONDAY",
            isRest: day.isRest,
            estimatedDurationInSeconds: day.estimatedDurationInSeconds,
            coverImageUrl: day.coverImageUrl ?? null,
            exercises: (day.isRest ? [] : day.exercises).map((ex, exIndex) => {
              return {
                order: published ? exIndex : (ex.order ?? exIndex),
                ...catalogReference(ex),
                sets: ex.sets,
                warmupSets: ex.warmupSets ?? 0,
                reps: ex.reps,
                ...advancedPrescription(ex),
                restTimeInSeconds: ex.restTimeInSeconds,
              };
            }),
          })),
        };

        const allowStudentSubstitution =
          dto.allowStudentSubstitution ?? prescription.allowStudentSubstitution;
        let approvalFields: Prisma.WorkoutPrescriptionUncheckedUpdateInput = {};
        if (published) {
          if (
            !payload.workoutDays.some(
              (day) => !day.isRest && day.exercises.length > 0,
            )
          )
            throw new CoachPrescriptionError(
              "INVALID_PRESCRIPTION_PAYLOAD",
              400,
              "Adicione ao menos um treino com exercícios.",
            );
          const registration =
            await tx.professionalRegistration.findUniqueOrThrow({
              where: { userId: dto.coachId },
            });
          const approvedAt = new Date();
          const prescribedCrefSnapshot =
            registration.fullName +
            " — CREF " +
            registration.cref +
            "/" +
            registration.region;

          await tx.workoutPrescriptionRevision.create({
            data: {
              prescriptionId: prescription.id,
              version: prescription.version,
              approvedAt: prescription.approvedAt,
              snapshot: {
                name: prescription.name,
                notes: prescription.notes,
                payload: prescription.payload,
                allowStudentSubstitution: prescription.allowStudentSubstitution,
                approvedSnapshot: prescription.approvedSnapshot,
                approvedByUserId: prescription.approvedByUserId,
                approvedVersion: prescription.approvedVersion,
                prescribedCrefSnapshot: prescription.prescribedCrefSnapshot,
              },
            },
          });
          if (prescription.status === "ACCEPTED") {
            await syncAcceptedPrescriptionPlan({
              tx,
              planId: prescription.acceptedWorkoutPlanId,
              athleteId: prescription.athleteId,
              coachId: dto.coachId,
              originType: prescription.originType,
              days: payload.workoutDays,
              references: dto.workoutDays,
              name: trimmedName,
              allowStudentSubstitution,
              approvedAt,
              prescribedCrefSnapshot,
            });
          }
          approvalFields = {
            prescriptionStatus: "APPROVED_PRESCRIBED",
            prescribedByProfessionalId: dto.coachId,
            prescribedCrefSnapshot,
            humanApprovedAt: approvedAt,
            approvedByUserId: dto.coachId,
            approvedAt,
            approvedVersion: prescription.version + 1,
            approvedSnapshot: {
              verificationMode: "VERIFIED",
              name: trimmedName,
              notes: dto.notes ?? null,
              payload,
              allowStudentSubstitution,
            },
          };
        }

        const updated = await tx.workoutPrescription.update({
          where: { id: prescription.id },
          data: {
            ...approvalFields,
            allowStudentSubstitution,
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
          originType: updated.originType,
          prescriptionStatus: updated.prescriptionStatus,
          prescribedCrefSnapshot: updated.prescribedCrefSnapshot,
          allowStudentSubstitution: updated.allowStudentSubstitution,
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
