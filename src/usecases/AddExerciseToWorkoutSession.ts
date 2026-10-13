import {
  NotFoundError,
  ValidationError,
  WorkoutSessionAlreadyCompletedError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  sessionId: string;
  exerciseId: string;
}

interface OutputDto {
  id: string;
  exerciseId?: string | null;
  hasMedia?: boolean;
  exerciseNameSnapshot: string;
  order: number;
  plannedWarmupSets?: number | null;
  plannedSets: number | null;
  plannedReps: number | null;
  plannedRestTimeInSeconds: number | null;
  notes: string | null;
  sets: [];
}

export class AddExerciseToWorkoutSession {
  async execute(dto: InputDto): Promise<OutputDto> {
    const session = await prisma.workoutSession.findUnique({
      where: { id: dto.sessionId },
    });

    if (!session || session.athleteId !== dto.userId) {
      throw new NotFoundError("Workout session not found");
    }

    if (session.completedAt !== null) {
      throw new WorkoutSessionAlreadyCompletedError(
        "Workout session is already completed",
      );
    }

    if (session.workoutDayId !== null) {
      throw new ValidationError(
        "Cannot manually add exercise to a planned workout session",
      );
    }

    const exercise = await prisma.exercise.findUnique({
      where: { id: dto.exerciseId },
      include: {
        media: {
          where: { isActive: true },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (
      !exercise ||
      (exercise.ownerUserId !== null && exercise.ownerUserId !== dto.userId)
    ) {
      throw new NotFoundError("Exercise not found");
    }

    const lastExercise = await prisma.sessionExercise.findFirst({
      where: { workoutSessionId: session.id },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const nextOrder = lastExercise ? lastExercise.order + 1 : 1;

    const created = await prisma.sessionExercise.create({
      data: {
        id: crypto.randomUUID(),
        workoutSessionId: session.id,
        sourceWorkoutExerciseId: null,
        exerciseId: exercise.id,
        exerciseNameSnapshot: exercise.name,
        order: nextOrder,
        plannedSets: null,
        plannedReps: null,
        plannedRestTimeInSeconds: null,
      },
    });

    return {
      id: created.id,
      exerciseId: created.exerciseId,
      hasMedia: Boolean(exercise.media && exercise.media.length > 0),
      exerciseNameSnapshot: created.exerciseNameSnapshot,
      order: created.order,
      plannedWarmupSets: null,
      plannedSets: null,
      plannedReps: null,
      plannedRestTimeInSeconds: null,
      notes: null,
      sets: [],
    };
  }
}
