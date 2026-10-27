import { ValidationError } from "../errors/index.js";

export interface AlternativesInput {
  mainExerciseId?: string | null;
  mainExerciseName?: string | null;
  alternative1ExerciseId?: string | null;
  alternative2ExerciseId?: string | null;
}

export interface NormalizedAlternatives {
  alternative1ExerciseId: string | null;
  alternative2ExerciseId: string | null;
}

/**
 * Normaliza e valida alternativas de exercício.
 *
 * Invariantes da Task 6.4:
 * 1. Slot Shifting: Se o slot 1 for nulo e o slot 2 for fornecido, desloca slot 2 para o slot 1.
 * 2. Unicidade:
 *    - Alternativa 1 não pode ser idêntica ao exercício principal.
 *    - Alternativa 2 não pode ser idêntica ao exercício principal.
 *    - Alternativa 1 e Alternativa 2 não podem ser idênticas entre si.
 */
export function normalizeAndValidateAlternatives(
  input: AlternativesInput,
): NormalizedAlternatives {
  let alt1 = input.alternative1ExerciseId?.trim() || null;
  let alt2 = input.alternative2ExerciseId?.trim() || null;
  const mainId = input.mainExerciseId?.trim() || null;

  // 1. Slot shifting: se slot 1 vazio e slot 2 preenchido, move para slot 1
  if (!alt1 && alt2) {
    alt1 = alt2;
    alt2 = null;
  }

  // Se ambos forem nulos, nada a validar
  if (!alt1 && !alt2) {
    return {
      alternative1ExerciseId: null,
      alternative2ExerciseId: null,
    };
  }

  // 2. Validações contra o exercício principal
  if (mainId) {
    if (alt1 && alt1 === mainId) {
      throw new ValidationError(
        "O primeiro exercício alternativo não pode ser igual ao exercício principal.",
      );
    }
    if (alt2 && alt2 === mainId) {
      throw new ValidationError(
        "O segundo exercício alternativo não pode ser igual ao exercício principal.",
      );
    }
  }

  // 3. Validação entre as próprias alternativas
  if (alt1 && alt2 && alt1 === alt2) {
    throw new ValidationError(
      "As duas alternativas de exercício devem ser diferentes entre si.",
    );
  }

  return {
    alternative1ExerciseId: alt1,
    alternative2ExerciseId: alt2,
  };
}

/**
 * Sanitiza e normaliza alternativas de exercício de forma resiliente,
 * removendo duplicidades e conflitos com o exercício principal sem lançar erro.
 * Indicado para importações, prescrições de treinador, saídas de IA e aceites.
 */
export function sanitizeAndNormalizeAlternatives(
  input: AlternativesInput,
): NormalizedAlternatives {
  let alt1 = input.alternative1ExerciseId?.trim() || null;
  let alt2 = input.alternative2ExerciseId?.trim() || null;
  const mainId = input.mainExerciseId?.trim() || null;

  // 1. Remover alternativas idênticas ao exercício principal
  if (mainId) {
    if (alt1 && alt1 === mainId) {
      alt1 = null;
    }
    if (alt2 && alt2 === mainId) {
      alt2 = null;
    }
  }

  // 2. Remover alternativa 2 se for idêntica à alternativa 1
  if (alt1 && alt2 && alt1 === alt2) {
    alt2 = null;
  }

  // 3. Slot shifting: se slot 1 vazio e slot 2 preenchido, move para slot 1
  if (!alt1 && alt2) {
    alt1 = alt2;
    alt2 = null;
  }

  return {
    alternative1ExerciseId: alt1,
    alternative2ExerciseId: alt2,
  };
}
