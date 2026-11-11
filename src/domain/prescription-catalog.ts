import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { CoachPrescriptionError } from "./coach-prescription.js";

interface ExerciseReference {
  name: string;
  exerciseId?: string | null;
  alternative1ExerciseId?: string | null;
  alternative1ExerciseName?: string | null;
  alternative2ExerciseId?: string | null;
  alternative2ExerciseName?: string | null;
}

/** Validate explicit IDs in one scoped query; keep old name-only snapshots readable. */
export async function resolvePrescriptionCatalogReferences({
  coachId,
  exercises,
  client = prisma,
}: {
  coachId: string;
  exercises: ExerciseReference[];
  client?: Pick<Prisma.TransactionClient, "exercise">;
}) {
  const ids = [
    ...new Set(
      exercises
        .flatMap((exercise) => [
          exercise.exerciseId,
          exercise.alternative1ExerciseId,
          exercise.alternative2ExerciseId,
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const catalog = ids.length
    ? await client.exercise.findMany({
        where: {
          id: { in: ids },
          OR: [{ ownerUserId: null }, { ownerUserId: coachId }],
        },
        select: { id: true, name: true },
      })
    : [];
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise.name]));
  if (ids.some((id) => !byId.has(id))) {
    throw new CoachPrescriptionError(
      "INVALID_PRESCRIPTION_PAYLOAD",
      400,
      "Selecione exercícios disponíveis no catálogo ou na sua biblioteca pessoal.",
    );
  }

  return (exercise: ExerciseReference) => {
    const main = {
      id: exercise.exerciseId ?? null,
      name: exercise.exerciseId
        ? byId.get(exercise.exerciseId)!
        : exercise.name.trim(),
    };
    const candidates = [
      {
        id: exercise.alternative1ExerciseId ?? null,
        name: exercise.alternative1ExerciseName,
      },
      {
        id: exercise.alternative2ExerciseId ?? null,
        name: exercise.alternative2ExerciseName,
      },
    ].map((alternative) => ({
      id: alternative.id,
      name: alternative.id
        ? byId.get(alternative.id)!
        : alternative.name?.trim() || null,
    }));
    const sameReference = (
      first: { id: string | null; name?: string | null },
      second: { id: string | null; name?: string | null },
    ) =>
      first.id && second.id
        ? first.id === second.id
        : first.name?.toLowerCase() === second.name?.toLowerCase();
    const alternatives = candidates.filter(
      (alternative, index) =>
        alternative.name &&
        !sameReference(alternative, main) &&
        !candidates
          .slice(0, index)
          .some((previous) => sameReference(alternative, previous)),
    );
    return {
      exerciseId: main.id,
      name: main.name,
      alternative1ExerciseId: alternatives[0]?.id ?? null,
      alternative1ExerciseName: alternatives[0]?.name ?? null,
      alternative2ExerciseId: alternatives[1]?.id ?? null,
      alternative2ExerciseName: alternatives[1]?.name ?? null,
    };
  };
}
