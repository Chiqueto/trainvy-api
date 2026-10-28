import { ValidationError } from "../errors/index.js";
import { Prisma } from "../generated/prisma/client.js";
import { MuscleGroup, MuscleRole } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";
import { REVIEWED_EXERCISES } from "./exercise-catalog-review.js";

export { MuscleGroup, MuscleRole };

export interface MuscleClassification {
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
}

/**
 * Mapeamento canônico explícito e versionado de exercícios conhecidos.
 * Usado exclusivamente para catalogar exercícios globais (ownerUserId = null).
 * Exercícios personalizados dos usuários NUNCA são modificados por este catálogo.
 */
export const GLOBAL_EXERCISE_MUSCLE_MAPPING: Record<
  string,
  MuscleClassification
> = Object.fromEntries(
  REVIEWED_EXERCISES.map((e) => [
    e.name.trim().toLowerCase(),
    { primary: e.primary, secondary: e.secondary },
  ]),
);

/**
 * Valida a integridade da classificação muscular:
 * - Deduplica cada lista.
 * - Impede o mesmo músculo como PRIMARY e SECONDARY.
 * - Se classificado, exige pelo menos 1 PRIMARY.
 * - Aceita múltiplos PRIMARY.
 */
export function validateAndSanitizeMuscles(
  primaryInput?: MuscleGroup[],
  secondaryInput?: MuscleGroup[],
): {
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  isClassified: boolean;
} {
  const primarySet = new Set(primaryInput ?? []);
  const secondarySet = new Set(secondaryInput ?? []);

  // Verificar sobreposição
  for (const muscle of secondarySet) {
    if (primarySet.has(muscle)) {
      throw new ValidationError(
        `O grupo muscular ${muscle} não pode ser simultaneamente primário e secundário.`,
      );
    }
  }

  const primary = Array.from(primarySet);
  const secondary = Array.from(secondarySet);

  const isClassified = primary.length > 0 || secondary.length > 0;

  if (isClassified && primary.length === 0) {
    throw new ValidationError(
      "Um exercício classificado deve possuir pelo menos um grupo muscular primário (PRIMARY).",
    );
  }

  return { primary, secondary, isClassified };
}

/**
 * Sincroniza / classifica exercícios globais conhecidos no banco de dados.
 * Idempotente: não cria duplicatas e NUNCA altera exercícios customizados (ownerUserId != null).
 */
export async function syncGlobalExerciseMuscles(
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{
  totalGlobals: number;
  classified: number;
  unclassified: number;
  unclassifiedNames: string[];
}> {
  const globals = await client.exercise.findMany({
    where: { ownerUserId: null },
    include: { muscles: true },
  });

  let classified = 0;
  let unclassified = 0;
  const unclassifiedNames: string[] = [];

  for (const globalEx of globals) {
    const normalizedName = globalEx.name.trim().toLowerCase();
    const mapping = GLOBAL_EXERCISE_MUSCLE_MAPPING[normalizedName];

    if (!mapping) {
      unclassified++;
      unclassifiedNames.push(globalEx.name);
      continue;
    }

    // Se já classificado, não duplicar
    if (globalEx.muscles.length > 0) {
      classified++;
      continue;
    }

    const records: Array<{
      exerciseId: string;
      muscleGroup: MuscleGroup;
      role: MuscleRole;
    }> = [
      ...mapping.primary.map((mg) => ({
        exerciseId: globalEx.id,
        muscleGroup: mg,
        role: MuscleRole.PRIMARY,
      })),
      ...mapping.secondary.map((mg) => ({
        exerciseId: globalEx.id,
        muscleGroup: mg,
        role: MuscleRole.SECONDARY,
      })),
    ];

    if (records.length > 0) {
      await client.exerciseMuscle.createMany({
        data: records,
        skipDuplicates: true,
      });
    }

    classified++;
  }

  return {
    totalGlobals: globals.length,
    classified,
    unclassified,
    unclassifiedNames,
  };
}
