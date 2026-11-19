import type { Prisma } from "../generated/prisma/client.js";
import {
  CoachPrescriptionError,
  type PrescriptionDayPayload,
} from "./coach-prescription.js";
import { buildPrescribedWorkouts } from "./prescribed-workout-data.js";

type SavedWorkoutReference = { id?: string; exercises: { id?: string }[] };

export async function syncAcceptedPrescriptionPlan({
  tx,
  planId,
  athleteId,
  coachId,
  originType,
  days,
  references,
  name,
  allowStudentSubstitution,
  approvedAt,
  prescribedCrefSnapshot,
}: {
  tx: Prisma.TransactionClient;
  planId: string | null;
  athleteId: string;
  coachId: string;
  originType: string;
  days: PrescriptionDayPayload[];
  references: SavedWorkoutReference[];
  name: string;
  allowStudentSubstitution: boolean;
  approvedAt: Date;
  prescribedCrefSnapshot: string;
}) {
  if (!planId)
    throw new CoachPrescriptionError(
      "ACCEPTED_PLAN_UNAVAILABLE",
      409,
      "O plano vinculado ao aluno não está mais disponível.",
    );

  // StartWorkoutSession takes the same lock before snapshotting a workout.
  await tx.$queryRaw`SELECT id FROM "WorkoutPlan" WHERE id = ${planId} AND "userId" = ${athleteId} FOR UPDATE`;
  const plan = await tx.workoutPlan.findFirst({
    where: {
      id: planId,
      userId: athleteId,
      deletedAt: null,
      prescriptionStatus: "APPROVED_PRESCRIBED",
      OR: [
        { prescribedByProfessionalId: coachId },
        { prescribedByProfessionalId: null, humanApprovedAt: null },
      ],
    },
    select: {
      workoutDays: {
        select: { id: true, exercises: { select: { id: true } } },
      },
    },
  });
  if (!plan)
    throw new CoachPrescriptionError(
      "ACCEPTED_PLAN_UNAVAILABLE",
      409,
      "O plano vinculado ao aluno não está mais disponível.",
    );

  const savedDays = new Map(
    plan.workoutDays.map((day) => [
      day.id,
      new Set(day.exercises.map((exercise) => exercise.id)),
    ]),
  );
  const keptDays = new Set<string>();
  for (const { id, exercises } of references) {
    const savedExercises = id ? savedDays.get(id) : undefined;
    if (id && (!savedExercises || keptDays.has(id)))
      throw new CoachPrescriptionError(
        "INVALID_PRESCRIPTION_PAYLOAD",
        400,
        "Há um treino inválido ou duplicado nesta revisão.",
      );
    if (id) keptDays.add(id);
    const exerciseIds = exercises.flatMap((exercise) =>
      exercise.id ? [exercise.id] : [],
    );
    if (
      new Set(exerciseIds).size !== exerciseIds.length ||
      exerciseIds.some((exerciseId) => !savedExercises?.has(exerciseId))
    )
      throw new CoachPrescriptionError(
        "INVALID_PRESCRIPTION_PAYLOAD",
        400,
        "Há um exercício inválido ou duplicado nesta revisão.",
      );
  }

  const workouts = await buildPrescribedWorkouts(tx, athleteId, days);
  for (const [index, workout] of workouts.entries()) {
    const reference = references[index];
    const dayId =
      reference.id ??
      (
        await tx.workoutDay.create({
          data: { ...workout.data, workoutPlanId: planId },
          select: { id: true },
        })
      ).id;
    if (reference.id) {
      await tx.workoutDay.update({ where: { id: dayId }, data: workout.data });
      await tx.workoutExercise.deleteMany({
        where: {
          workoutDayId: dayId,
          id: {
            notIn: reference.exercises.flatMap((exercise) =>
              exercise.id ? [exercise.id] : [],
            ),
          },
        },
      });
    }
    for (const [exerciseIndex, exercise] of workout.exercises.entries()) {
      const exerciseId = reference.exercises[exerciseIndex]?.id;
      if (exerciseId)
        await tx.workoutExercise.update({
          where: { id: exerciseId },
          data: exercise,
        });
      else
        await tx.workoutExercise.create({
          data: { ...exercise, workoutDayId: dayId },
        });
    }
  }

  const removedDays = [...savedDays.keys()].filter((id) => !keptDays.has(id));
  if (removedDays.length) {
    await tx.workoutExercise.deleteMany({
      where: { workoutDayId: { in: removedDays } },
    });
    await tx.workoutDay.deleteMany({
      where: { id: { in: removedDays }, workoutPlanId: planId },
    });
  }
  await tx.workoutPlan.update({
    where: { id: planId },
    data: {
      name,
      originType,
      prescribedByProfessionalId: coachId,
      allowStudentSubstitution,
      humanApprovedAt: approvedAt,
      prescribedCrefSnapshot,
    },
  });
}
