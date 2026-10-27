import { advancedPrescription } from "../schemas/advanced-prescription.js";
import {
  assertCoachCanPrescribe,
  CoachPrescriptionError,
  PrescriptionPayload,
} from "../domain/coach-prescription.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class AllocateWorkoutPlanTemplate {
  async execute({
    coachId,
    templateId,
    athleteId,
    notes,
  }: {
    coachId: string;
    templateId: string;
    athleteId: string;
    notes?: string | null;
  }) {
    if (coachId === athleteId) {
      throw new CoachPrescriptionError(
        "SELF_PRESCRIPTION_NOT_ALLOWED",
        400,
        "Você não pode prescrever treinos para você mesmo.",
      );
    }

    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });
    assertCoachCanPrescribe(commercialContext);

    // 1. Busca modelo do treinador
    const template = await prisma.workoutPlanTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template || template.coachId !== coachId) {
      throw new CoachPrescriptionError(
        "TEMPLATE_NOT_FOUND",
        404,
        "Modelo de treino não encontrado.",
      );
    }

    // 2. Valida vínculo ativo com o aluno
    const activeLink = await prisma.coachAthlete.findFirst({
      where: {
        coachId,
        athleteId,
        status: "ACTIVE",
      },
    });

    if (!activeLink) {
      throw new CoachPrescriptionError(
        "COACH_ATHLETE_LINK_REVOKED",
        403,
        "Vínculo ativo com este aluno não foi encontrado.",
      );
    }

    // 3. Cria prescrição diretamente em status SENT (já enviada ao aluno)
    const now = new Date();
    const prescription = await prisma.workoutPrescription.create({
      data: {
        coachId,
        athleteId,
        name: template.name,
        notes: notes?.trim() || template.description || null,
        status: "SENT",
        version: 1,
        sentAt: now,
        payload: template.payload as object,
      },
      include: {
        athlete: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
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
        athlete: prescription.athlete,
        payload: prescription.payload as unknown as PrescriptionPayload,
      },
    };
  }
}

export class CreateWorkoutPlanTemplateFromPlan {
  async execute({
    coachId,
    planId,
    name,
    description,
  }: {
    coachId: string;
    planId: string;
    name?: string;
    description?: string | null;
  }) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });
    assertCoachCanPrescribe(commercialContext);

    const plan = await prisma.workoutPlan.findUnique({
      where: { id: planId },
      include: {
        workoutDays: {
          orderBy: { order: "asc" },
          include: {
            exercises: {
              orderBy: { order: "asc" },
              include: {
                exercise: { select: { id: true, name: true } },
                alternative1Exercise: { select: { id: true, name: true } },
                alternative2Exercise: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!plan || plan.userId !== coachId) {
      throw new CoachPrescriptionError(
        "PLAN_NOT_FOUND",
        404,
        "Plano de treino não encontrado.",
      );
    }

    const templateName = name?.trim() || plan.name;
    const templateDescription = description?.trim() || null;

    const payload = {
      workoutDays: plan.workoutDays.map((day, index) => ({
        name: day.name,
        order: day.order ?? index,
        weekDay: day.weekDay,
        isRest: day.isRest,
        estimatedDurationInSeconds: day.estimatedDurationInSeconds,
        coverImageUrl: day.coverImageUrl ?? null,
        exercises: day.exercises.map((ex, exIndex) => {
          let alt1Name = ex.alternative1Exercise?.name || null;
          let alt2Name = ex.alternative2Exercise?.name || null;
          const exName = ex.name.trim();

          if (alt1Name && alt1Name.toLowerCase() === exName.toLowerCase())
            alt1Name = null;
          if (alt2Name && alt2Name.toLowerCase() === exName.toLowerCase())
            alt2Name = null;
          if (
            alt1Name &&
            alt2Name &&
            alt1Name.toLowerCase() === alt2Name.toLowerCase()
          )
            alt2Name = null;
          if (!alt1Name && alt2Name) {
            alt1Name = alt2Name;
            alt2Name = null;
          }

          return {
            order: ex.order ?? exIndex,
            name: exName,
            exerciseId: ex.exerciseId ?? null,
            alternative1ExerciseId: ex.alternative1ExerciseId ?? null,
            alternative1ExerciseName: alt1Name,
            alternative2ExerciseId: ex.alternative2ExerciseId ?? null,
            alternative2ExerciseName: alt2Name,
            sets: ex.sets,
            warmupSets: ex.warmupSets ?? 0,
            reps: ex.reps,
            ...advancedPrescription(ex),
            restTimeInSeconds: ex.restTimeInSeconds,
          };
        }),
      })),
    };

    const template = await prisma.workoutPlanTemplate.create({
      data: {
        coachId,
        name: templateName,
        description: templateDescription,
        payload,
      },
    });

    return {
      id: template.id,
      coachId: template.coachId,
      name: template.name,
      description: template.description,
      payload: template.payload as unknown as PrescriptionPayload,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }
}
