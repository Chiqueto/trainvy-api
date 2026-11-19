import type { Prisma } from "../generated/prisma/client.js";
import type { PrescriptionDayPayload } from "./coach-prescription.js";
import { resolveCanonicalExerciseMap } from "./canonical-exercise.js";
import { sanitizeAndNormalizeAlternatives } from "./exercise-alternatives.js";
import { advancedPrescription } from "../schemas/advanced-prescription.js";

export async function buildPrescribedWorkouts(
  tx: Prisma.TransactionClient,
  athleteId: string,
  days: PrescriptionDayPayload[],
) {
  const canonical = await resolveCanonicalExerciseMap({
    userId: athleteId,
    tx,
    names: days.flatMap((day) =>
      day.exercises.flatMap((exercise) =>
        [
          exercise.name,
          exercise.alternative1ExerciseName,
          exercise.alternative2ExerciseName,
        ].filter((name): name is string => !!name?.trim()),
      ),
    ),
  });

  return days.map(({ exercises, ...day }, index) => ({
    data: {
      name: day.name,
      order: day.order ?? index,
      weekDay: day.weekDay ?? "MONDAY",
      isRest: day.isRest,
      estimatedDurationInSeconds: day.estimatedDurationInSeconds,
      coverImageUrl: day.coverImageUrl ?? null,
    },
    exercises: exercises.map((exercise, exerciseIndex) => {
      const mainId =
        exercise.exerciseId ?? canonical.get(exercise.name) ?? null;
      const alternatives = sanitizeAndNormalizeAlternatives({
        mainExerciseId: mainId,
        mainExerciseName: exercise.name,
        alternative1ExerciseId:
          exercise.alternative1ExerciseId ??
          (exercise.alternative1ExerciseName
            ? canonical.get(exercise.alternative1ExerciseName)
            : null) ??
          null,
        alternative2ExerciseId:
          exercise.alternative2ExerciseId ??
          (exercise.alternative2ExerciseName
            ? canonical.get(exercise.alternative2ExerciseName)
            : null) ??
          null,
      });
      return {
        order: exercise.order ?? exerciseIndex,
        name: exercise.name,
        sets: exercise.sets,
        warmupSets: exercise.warmupSets ?? 0,
        reps: exercise.reps,
        ...advancedPrescription(exercise),
        restTimeInSeconds: exercise.restTimeInSeconds,
        exerciseId: mainId,
        ...alternatives,
      };
    }),
  }));
}
