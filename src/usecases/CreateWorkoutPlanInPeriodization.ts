import { advancedPrescription } from "../schemas/advanced-prescription.js";
import { resolveCanonicalExerciseMap } from "../domain/canonical-exercise.js";
import { normalizeAndValidateAlternatives } from "../domain/exercise-alternatives.js";
import {
  NotFoundError,
  PeriodizationCompletedError,
  ValidationError,
} from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  periodizationId: string;
  name: string;
  workoutDays: Array<{
    name: string;
    order?: number;
    weekDay?: WeekDay;
    isRest: boolean;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string | null;
    exercises: Array<{
      order: number;
      name: string;
      warmupSets?: number;
      sets: number;
      reps: number;
      repsMin?: number | null;
      repsMax?: number | null;
      targetRir?: number | null;
      targetLoadInGrams?: number | null;
      tempo?: string | null;
      restTimeInSeconds: number;
      exerciseId?: string | null;
      alternative1ExerciseId?: string | null;
      alternative1Name?: string | null;
      alternative2ExerciseId?: string | null;
      alternative2Name?: string | null;
    }>;
  }>;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  notes?: string | null;
}

interface OutputDto {
  id: string;
  periodizationId: string;
  workoutPlanId: string;
  order: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  workoutPlan: {
    id: string;
    name: string;
    isActive: boolean;
    workoutDays: Array<{
      name: string;
      weekDay: WeekDay;
      isRest: boolean;
      estimatedDurationInSeconds: number;
      coverImageUrl: string | null;
      exercises: Array<{
        order: number;
        name: string;
        warmupSets: number;
        sets: number;
        reps: number;
        repsMin?: number | null;
        repsMax?: number | null;
        targetRir?: number | null;
        targetLoadInGrams?: number | null;
        tempo?: string | null;
        restTimeInSeconds: number;
        exerciseId?: string | null;
        alternative1ExerciseId?: string | null;
        alternative2ExerciseId?: string | null;
      }>;
    }>;
  };
}

export class CreateWorkoutPlanInPeriodization {
  async execute(dto: InputDto): Promise<OutputDto> {
    const trimmedName = dto.name?.trim();
    if (!trimmedName) {
      throw new ValidationError("O nome do plano de treino é obrigatório.");
    }

    const startDate = dto.plannedStartDate
      ? new Date(dto.plannedStartDate)
      : null;
    const endDate = dto.plannedEndDate ? new Date(dto.plannedEndDate) : null;

    if (startDate && isNaN(startDate.getTime())) {
      throw new ValidationError("Data de início prevista inválida.");
    }
    if (endDate && isNaN(endDate.getTime())) {
      throw new ValidationError("Data de término prevista inválida.");
    }

    if (startDate && endDate && endDate < startDate) {
      throw new ValidationError(
        "plannedEndDate não pode ser anterior a plannedStartDate.",
      );
    }

    return await prisma.$transaction(async (tx) => {
      const periodization = await tx.periodization.findFirst({
        where: {
          id: dto.periodizationId,
          userId: dto.userId,
        },
        include: {
          plans: {
            select: {
              order: true,
            },
          },
        },
      });

      if (!periodization) {
        throw new NotFoundError("Periodização não encontrada.");
      }

      if (periodization.completedAt !== null) {
        throw new PeriodizationCompletedError(
          "A periodização já foi concluída e sua estrutura não pode ser alterada.",
        );
      }

      const allExerciseNames = dto.workoutDays.flatMap((day) =>
        day.exercises.flatMap((e) =>
          [e.name, e.alternative1Name, e.alternative2Name].filter(
            (n): n is string => !!n && n.trim().length > 0,
          ),
        ),
      );
      const canonicalExerciseMap = await resolveCanonicalExerciseMap({
        userId: dto.userId,
        names: allExerciseNames,
        tx,
      });

      const workoutPlan = await tx.workoutPlan.create({
        data: {
          id: crypto.randomUUID(),
          name: trimmedName,
          userId: dto.userId,
          isActive: false, // Invariante: sempre inativo quando criado em periodização
          workoutDays: {
            create: dto.workoutDays.map((workoutDay, index) => ({
              name: workoutDay.name,
              order: workoutDay.order ?? index,
              weekDay: workoutDay.weekDay ?? WeekDay.MONDAY,
              isRest: workoutDay.isRest,
              estimatedDurationInSeconds: workoutDay.estimatedDurationInSeconds,
              coverImageUrl: workoutDay.coverImageUrl ?? null,
              exercises: {
                create: workoutDay.exercises.map((exercise) => {
                  const resolvedMainId =
                    exercise.exerciseId ??
                    canonicalExerciseMap.get(exercise.name.trim()) ??
                    canonicalExerciseMap.get(exercise.name) ??
                    null;

                  const resolvedAlt1Id =
                    exercise.alternative1ExerciseId ??
                    (exercise.alternative1Name
                      ? (canonicalExerciseMap.get(
                          exercise.alternative1Name.trim(),
                        ) ??
                        canonicalExerciseMap.get(exercise.alternative1Name))
                      : null) ??
                    null;

                  const resolvedAlt2Id =
                    exercise.alternative2ExerciseId ??
                    (exercise.alternative2Name
                      ? (canonicalExerciseMap.get(
                          exercise.alternative2Name.trim(),
                        ) ??
                        canonicalExerciseMap.get(exercise.alternative2Name))
                      : null) ??
                    null;

                  const { alternative1ExerciseId, alternative2ExerciseId } =
                    normalizeAndValidateAlternatives({
                      mainExerciseId: resolvedMainId,
                      mainExerciseName: exercise.name,
                      alternative1ExerciseId: resolvedAlt1Id,
                      alternative2ExerciseId: resolvedAlt2Id,
                    });

                  return {
                    order: exercise.order,
                    name: exercise.name,
                    warmupSets: exercise.warmupSets ?? 0,
                    sets: exercise.sets,
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
        include: {
          workoutDays: {
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            include: {
              exercises: {
                orderBy: { order: "asc" },
              },
            },
          },
        },
      });

      const maxOrder = periodization.plans.reduce(
        (max, p) => Math.max(max, p.order),
        0,
      );
      const targetOrder = maxOrder + 1;

      const periodizationPlan = await tx.periodizationPlan.create({
        data: {
          id: crypto.randomUUID(),
          periodizationId: dto.periodizationId,
          workoutPlanId: workoutPlan.id,
          order: targetOrder,
          plannedStartDate: startDate,
          plannedEndDate: endDate,
          notes: dto.notes?.trim() || null,
          activatedAt: null,
          completedAt: null,
        },
      });

      return {
        id: periodizationPlan.id,
        periodizationId: periodizationPlan.periodizationId,
        workoutPlanId: periodizationPlan.workoutPlanId,
        order: periodizationPlan.order,
        plannedStartDate: periodizationPlan.plannedStartDate
          ? periodizationPlan.plannedStartDate.toISOString().split("T")[0]
          : null,
        plannedEndDate: periodizationPlan.plannedEndDate
          ? periodizationPlan.plannedEndDate.toISOString().split("T")[0]
          : null,
        activatedAt: null,
        completedAt: null,
        notes: periodizationPlan.notes,
        createdAt: periodizationPlan.createdAt.toISOString(),
        updatedAt: periodizationPlan.updatedAt.toISOString(),
        workoutPlan: {
          id: workoutPlan.id,
          name: workoutPlan.name,
          isActive: workoutPlan.isActive,
          workoutDays: workoutPlan.workoutDays.map((day) => ({
            name: day.name,
            order: day.order,
            weekDay: day.weekDay,
            isRest: day.isRest,
            estimatedDurationInSeconds: day.estimatedDurationInSeconds,
            coverImageUrl: day.coverImageUrl,
            exercises: day.exercises.map((exercise) => ({
              order: exercise.order,
              name: exercise.name,
              warmupSets: exercise.warmupSets,
              sets: exercise.sets,
              reps: exercise.reps,
              ...advancedPrescription(exercise),
              restTimeInSeconds: exercise.restTimeInSeconds,
              exerciseId: exercise.exerciseId,
              alternative1ExerciseId: exercise.alternative1ExerciseId,
              alternative2ExerciseId: exercise.alternative2ExerciseId,
            })),
          })),
        },
      };
    });
  }
}
