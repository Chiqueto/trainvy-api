import { advancedPrescription } from "../schemas/advanced-prescription.js";
import z from "zod";

import { resolveCanonicalExerciseMap } from "../domain/canonical-exercise.js";
import { normalizeAndValidateAlternatives } from "../domain/exercise-alternatives.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";
import { UpdateWorkoutPlanBody } from "../schemas/workout-edit.js";

const include = {
  workoutDays: {
    orderBy: { order: "asc" as const },
    include: {
      exercises: {
        orderBy: { order: "asc" as const },
        include: {
          alternative1Exercise: { select: { name: true } },
          alternative2Exercise: { select: { name: true } },
        },
      },
    },
  },
};

export class GetEditableWorkoutPlan {
  async execute(userId: string, id: string) {
    const plan = await prisma.workoutPlan.findFirst({
      where: { id, userId, deletedAt: null },
      include,
    });
    if (!plan) throw new NotFoundError("Plano de treino não encontrado.");
    return {
      id: plan.id,
      name: plan.name,
      isActive: plan.isActive,
      workoutDays: plan.workoutDays.map((day) => ({
        ...day,
        exercises: day.exercises.map((e) => ({
          ...e,
          alternative1Name: e.alternative1Exercise?.name ?? null,
          alternative2Name: e.alternative2Exercise?.name ?? null,
        })),
      })),
    };
  }
}

export class EditWorkoutPlan {
  async execute(
    userId: string,
    id: string,
    input: z.input<typeof UpdateWorkoutPlanBody>,
  ) {
    const data = UpdateWorkoutPlanBody.parse(input);
    await prisma.$transaction(
      async (tx) => {
        // Shared with StartWorkoutSession: editing and snapshot creation cannot interleave.
        await tx.$queryRaw`SELECT id FROM "WorkoutPlan" WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE`;
        const plan = await tx.workoutPlan.findFirst({
          where: { id, userId, deletedAt: null },
          include: {
            workoutDays: { include: { exercises: true } },
          },
        });
        if (!plan) throw new NotFoundError("Plano de treino não encontrado.");
        if (
          await tx.workoutSession.findFirst({
            where: { athleteId: userId, workoutPlanId: id, completedAt: null },
          })
        ) {
          throw new ConflictError(
            "Conclua ou cancele a sessão deste plano antes de editar.",
            "ACTIVE_WORKOUT_SESSION",
          );
        }
        // The student owns the editable copy; the original approved snapshot remains immutable.
        await tx.workoutPrescription.updateMany({
          where: { acceptedWorkoutPlanId: id },
          data: { acceptedWorkoutPlanId: null },
        });
        const dayIds = data.workoutDays.flatMap((d) => (d.id ? [d.id] : []));
        const exerciseIds = data.workoutDays.flatMap((d) =>
          d.exercises.flatMap((e) => (e.id ? [e.id] : [])),
        );
        if (
          new Set(dayIds).size !== dayIds.length ||
          new Set(exerciseIds).size !== exerciseIds.length
        ) {
          throw new BadRequestError("Dias ou exercícios duplicados.");
        }
        // IDs from the browser must belong to this plan/day; foreign IDs never get reassigned.
        for (const day of data.workoutDays) {
          const existing = plan.workoutDays.find((d) => d.id === day.id);
          if (day.id && !existing)
            throw new NotFoundError("Treino não encontrado neste plano.");
          for (const e of day.exercises) {
            if (e.id && !existing?.exercises.some((x) => x.id === e.id))
              throw new NotFoundError("Exercício não encontrado neste treino.");
          }
        }
        const exercises = data.workoutDays.flatMap((d) => d.exercises);
        const requestedIds = exercises
          .flatMap((e) => [
            e.exerciseId,
            e.alternative1ExerciseId,
            e.alternative2ExerciseId,
          ])
          .filter((x): x is string => !!x);
        const accessible = await tx.exercise.findMany({
          where: {
            id: { in: requestedIds },
            OR: [{ ownerUserId: null }, { ownerUserId: userId }],
          },
          select: { id: true },
        });
        if (requestedIds.some((x) => !accessible.some((e) => e.id === x)))
          throw new NotFoundError("Exercício indisponível.");
        const canonical = await resolveCanonicalExerciseMap({
          userId,
          tx,
          names: exercises.flatMap((e) =>
            [e.name, e.alternative1Name, e.alternative2Name].filter(
              (x): x is string => !!x,
            ),
          ),
        });
        for (const [order, day] of data.workoutDays.entries()) {
          const dayData = {
            name: day.name,
            order,
            weekDay: day.weekDay,
            isRest: day.isRest,
            estimatedDurationInSeconds: day.estimatedDurationInSeconds,
            coverImageUrl: day.coverImageUrl ?? null,
          };
          const savedDay = day.id
            ? await tx.workoutDay.update({
                where: { id: day.id },
                data: dayData,
              })
            : await tx.workoutDay.create({
                data: { ...dayData, workoutPlanId: id },
              });
          await tx.workoutExercise.deleteMany({
            where: {
              workoutDayId: savedDay.id,
              id: { notIn: day.exercises.flatMap((e) => (e.id ? [e.id] : [])) },
            },
          });
          for (const [exerciseOrder, e] of day.exercises.entries()) {
            const previous = plan.workoutDays
              .find((d) => d.id === day.id)
              ?.exercises.find((item) => item.id === e.id);
            const exerciseId = e.exerciseId ?? canonical.get(e.name) ?? null;
            const alternatives = normalizeAndValidateAlternatives({
              mainExerciseId: exerciseId,
              alternative1ExerciseId:
                e.alternative1ExerciseId ??
                (e.alternative1Name ? canonical.get(e.alternative1Name) : null),
              alternative2ExerciseId:
                e.alternative2ExerciseId ??
                (e.alternative2Name ? canonical.get(e.alternative2Name) : null),
            });
            const exerciseData = {
              name: e.name,
              order: exerciseOrder,
              exerciseId,
              ...alternatives,
              sets: e.sets,
              warmupSets: e.warmupSets,
              reps: e.reps,
              ...advancedPrescription({ ...previous, ...e }),
              restTimeInSeconds: e.restTimeInSeconds,
            };
            if (e.id)
              await tx.workoutExercise.update({
                where: { id: e.id },
                data: exerciseData,
              });
            else
              await tx.workoutExercise.create({
                data: { ...exerciseData, workoutDayId: savedDay.id },
              });
          }
        }
        // Historical executions retain their immutable snapshots when a prescribed day is removed.
        const removedDays = plan.workoutDays
          .filter((d) => !dayIds.includes(d.id))
          .map((d) => d.id);
        await tx.workoutExercise.deleteMany({
          where: { workoutDayId: { in: removedDays } },
        });
        await tx.workoutDay.deleteMany({
          where: { id: { in: removedDays }, workoutPlanId: id },
        });
        await tx.workoutPlan.update({
          where: { id },
          data: { name: data.name },
        });
      },
      { timeout: 15000 },
    );
    return { id, success: true };
  }
}
