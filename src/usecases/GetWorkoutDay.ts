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
    warmupSets: number;
    sets: number;
    reps: number;
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
          },
        },
        sessions: true,
      },
    });

    if (!workoutDay) {
      throw new NotFoundError("Workout day not found");
    }

    const customExercisesWithoutDirectMedia = workoutDay.exercises.filter(
      (e) => e.exercise && e.exercise.media.length === 0,
    );
    const fallbackGlobalNames = new Set<string>();
    if (customExercisesWithoutDirectMedia.length > 0) {
      const globalsWithMedia = await prisma.exercise.findMany({
        where: {
          ownerUserId: null,
          media: { some: { isActive: true } },
        },
        select: { name: true },
      });
      for (const g of globalsWithMedia) {
        fallbackGlobalNames.add(g.name.trim().toLowerCase());
      }
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
          (exercise.exercise?.media && exercise.exercise.media.length > 0) ||
            (exercise.exercise?.name &&
              fallbackGlobalNames.has(exercise.exercise.name.trim().toLowerCase())),
        ),
        name: exercise.name,
        order: exercise.order,
        workoutDayId: exercise.workoutDayId,
        warmupSets: exercise.warmupSets,
        sets: exercise.sets,
        reps: exercise.reps,
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
