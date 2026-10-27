import { advancedPrescription } from "../schemas/advanced-prescription.js";
import dayjs from "dayjs";

import { NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
}

interface OutputDto {
  id: string;
  name: string;
  isRest: boolean;
  coverImageUrl: string | null;
  estimatedDurationInSeconds: number;
  weekDay: WeekDay;
  exercises: Array<{
    id: string;
    exerciseId?: string | null;
    hasMedia?: boolean;
    name: string;
    order: number;
    workoutDayId: string;
    alternative1ExerciseId?: string | null;
    alternative1Exercise?: { id: string; name: string } | null;
    alternative2ExerciseId?: string | null;
    alternative2Exercise?: { id: string; name: string } | null;
    warmupSets: number;
    sets: number;
    reps: number;
    repsMin?: number | null;
    repsMax?: number | null;
    targetRir?: number | null;
    targetLoadInGrams?: number | null;
    tempo?: string | null;
    restTimeInSeconds: number;
  }>;
  sessions: Array<{
    id: string;
    workoutDayId: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
}

export class GetWorkoutDay {
  async execute(dto: InputDto): Promise<OutputDto> {
    const workoutDay = await prisma.workoutDay.findFirst({
      where: {
        id: dto.workoutDayId,
        workoutPlanId: dto.workoutPlanId,
        workoutPlan: {
          userId: dto.userId,
        },
      },
      include: {
        exercises: {
          orderBy: { order: "asc" },
          include: {
            exercise: {
              select: {
                id: true,
                name: true,
                media: {
                  where: { isActive: true },
                  select: { id: true },
                  take: 1,
                },
              },
            },
            alternative1Exercise: {
              select: {
                id: true,
                name: true,
              },
            },
            alternative2Exercise: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        sessions: true,
      },
    });

    if (!workoutDay) {
      throw new NotFoundError("Workout day not found");
    }

    return {
      id: workoutDay.id,
      name: workoutDay.name,
      isRest: workoutDay.isRest,
      coverImageUrl: workoutDay.coverImageUrl,
      estimatedDurationInSeconds: workoutDay.estimatedDurationInSeconds,
      weekDay: workoutDay.weekDay,
      exercises: workoutDay.exercises.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId ?? null,
        hasMedia: Boolean(
          exercise.exercise?.media && exercise.exercise.media.length > 0,
        ),
        name: exercise.name,
        order: exercise.order,
        workoutDayId: exercise.workoutDayId,
        alternative1ExerciseId: exercise.alternative1ExerciseId ?? null,
        alternative1Exercise: exercise.alternative1Exercise ?? null,
        alternative2ExerciseId: exercise.alternative2ExerciseId ?? null,
        alternative2Exercise: exercise.alternative2Exercise ?? null,
        warmupSets: exercise.warmupSets,
        sets: exercise.sets,
        reps: exercise.reps,
        ...advancedPrescription(exercise),
        restTimeInSeconds: exercise.restTimeInSeconds,
      })),
      sessions: workoutDay.sessions.map((session) => ({
        id: session.id,
        workoutDayId: session.workoutDayId,
        startedAt: dayjs(session.startedAt).format("YYYY-MM-DD"),
        completedAt: session.completedAt
          ? dayjs(session.completedAt).format("YYYY-MM-DD")
          : null,
      })),
    };
  }
}
