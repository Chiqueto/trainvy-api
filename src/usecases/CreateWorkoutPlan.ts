import { advancedPrescription } from "../schemas/advanced-prescription.js";
import { resolveCanonicalExerciseMap } from "../domain/canonical-exercise.js";
import { normalizeAndValidateAlternatives } from "../domain/exercise-alternatives.js";
import {
  ActivePeriodizationError,
  ConflictError,
  NotFoundError,
} from "../errors/index.js";
import { Prisma } from "../generated/prisma/client.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  name: string;
  activate?: boolean;
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
      sets: number;
      warmupSets?: number;
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
      alternative1Name?: string | null;
      alternative2Name?: string | null;
    }>;
  }>;
}

interface OutputDto {
  id: string;
  name: string;
  isActive: boolean;
  workoutDays: Array<{
    name: string;
    order?: number;
    weekDay: WeekDay;
    isRest: boolean;
    estimatedDurationInSeconds: number;
    coverImageUrl: string | null;
    exercises: Array<{
      order: number;
      name: string;
      sets: number;
      warmupSets: number;
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
}

export class CreateWorkoutPlan {
  async execute(dto: InputDto): Promise<OutputDto> {
    const shouldActivate = dto.activate ?? true;

    try {
      return await prisma.$transaction(
        async (tx) => {
          if (shouldActivate) {
            const activePeriodization = await tx.periodization.findFirst({
              where: {
                userId: dto.userId,
                isActive: true,
              },
            });

            if (activePeriodization) {
              throw new ActivePeriodizationError(
                "Existe uma periodização ativa. Crie o plano como inativo ou pause a periodização primeiro.",
              );
            }

            await tx.workoutPlan.updateMany({
              where: {
                userId: dto.userId,
                isActive: true,
              },
              data: {
                isActive: false,
              },
            });
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
              name: dto.name,
              userId: dto.userId,
              isActive: shouldActivate,
              workoutDays: {
                create: dto.workoutDays.map((workoutDay, index) => ({
                  name: workoutDay.name,
                  order: workoutDay.order ?? index,
                  weekDay: workoutDay.weekDay ?? WeekDay.MONDAY,
                  isRest: workoutDay.isRest,
                  estimatedDurationInSeconds:
                    workoutDay.estimatedDurationInSeconds,
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

          const result = await tx.workoutPlan.findFirst({
            where: {
              id: workoutPlan.id,
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

          if (!result) {
            throw new NotFoundError("Workout plan not found");
          }

          return {
            id: result.id,
            name: result.name,
            isActive: result.isActive,
            workoutDays: result.workoutDays.map((day) => ({
              name: day.name,
              order: day.order,
              weekDay: day.weekDay,
              isRest: day.isRest,
              estimatedDurationInSeconds: day.estimatedDurationInSeconds,
              coverImageUrl: day.coverImageUrl,
              exercises: day.exercises.map((exercise) => ({
                order: exercise.order,
                name: exercise.name,
                sets: exercise.sets,
                warmupSets: exercise.warmupSets,
                reps: exercise.reps,
                ...advancedPrescription(exercise),
                restTimeInSeconds: exercise.restTimeInSeconds,
                exerciseId: exercise.exerciseId,
                alternative1ExerciseId: exercise.alternative1ExerciseId,
                alternative2ExerciseId: exercise.alternative2ExerciseId,
              })),
            })),
          };
        },
        {
          maxWait: 5000,
          timeout: 15000,
        },
      );
    } catch (error) {
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002") ||
        (typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code: string }).code === "P2002")
      ) {
        throw new ConflictError("User already has an active workout plan");
      }

      throw error;
    }
  }
}
