import { describe, expect, it } from "vitest";

import {
  normalizeAndValidateAlternatives,
  sanitizeAndNormalizeAlternatives,
} from "../../src/domain/exercise-alternatives.js";
import { ValidationError } from "../../src/errors/index.js";

describe("normalizeAndValidateAlternatives", () => {
  it("returns nulls when no alternatives are provided", () => {
    const result = normalizeAndValidateAlternatives({
      mainExerciseId: "ex-main",
      alternative1ExerciseId: null,
      alternative2ExerciseId: null,
    });

    expect(result).toEqual({
      alternative1ExerciseId: null,
      alternative2ExerciseId: null,
    });
  });

  it("shifts alternative 2 to slot 1 if slot 1 is null", () => {
    const result = normalizeAndValidateAlternatives({
      mainExerciseId: "ex-main",
      alternative1ExerciseId: null,
      alternative2ExerciseId: "ex-alt-b",
    });

    expect(result).toEqual({
      alternative1ExerciseId: "ex-alt-b",
      alternative2ExerciseId: null,
    });
  });

  it("accepts two distinct valid alternatives", () => {
    const result = normalizeAndValidateAlternatives({
      mainExerciseId: "ex-main",
      alternative1ExerciseId: "ex-alt-1",
      alternative2ExerciseId: "ex-alt-2",
    });

    expect(result).toEqual({
      alternative1ExerciseId: "ex-alt-1",
      alternative2ExerciseId: "ex-alt-2",
    });
  });

  it("throws ValidationError if alternative1 equals main exercise", () => {
    expect(() =>
      normalizeAndValidateAlternatives({
        mainExerciseId: "ex-main",
        alternative1ExerciseId: "ex-main",
        alternative2ExerciseId: "ex-alt-2",
      }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError if alternative2 equals main exercise", () => {
    expect(() =>
      normalizeAndValidateAlternatives({
        mainExerciseId: "ex-main",
        alternative1ExerciseId: "ex-alt-1",
        alternative2ExerciseId: "ex-main",
      }),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError if alternative1 equals alternative2", () => {
    expect(() =>
      normalizeAndValidateAlternatives({
        mainExerciseId: "ex-main",
        alternative1ExerciseId: "ex-alt-1",
        alternative2ExerciseId: "ex-alt-1",
      }),
    ).toThrow(ValidationError);
  });
});

describe("sanitizeAndNormalizeAlternatives", () => {
  it("drops alternative1 when it equals main exercise and shifts slot 2", () => {
    const result = sanitizeAndNormalizeAlternatives({
      mainExerciseId: "ex-main",
      alternative1ExerciseId: "ex-main",
      alternative2ExerciseId: "ex-alt-2",
    });

    expect(result).toEqual({
      alternative1ExerciseId: "ex-alt-2",
      alternative2ExerciseId: null,
    });
  });

  it("drops alternative2 when it equals main exercise", () => {
    const result = sanitizeAndNormalizeAlternatives({
      mainExerciseId: "ex-main",
      alternative1ExerciseId: "ex-alt-1",
      alternative2ExerciseId: "ex-main",
    });

    expect(result).toEqual({
      alternative1ExerciseId: "ex-alt-1",
      alternative2ExerciseId: null,
    });
  });

  it("drops alternative2 when it equals alternative1", () => {
    const result = sanitizeAndNormalizeAlternatives({
      mainExerciseId: "ex-main",
      alternative1ExerciseId: "ex-alt-1",
      alternative2ExerciseId: "ex-alt-1",
    });

    expect(result).toEqual({
      alternative1ExerciseId: "ex-alt-1",
      alternative2ExerciseId: null,
    });
  });

  it("shifts alternative 2 to slot 1 if slot 1 is empty", () => {
    const result = sanitizeAndNormalizeAlternatives({
      mainExerciseId: "ex-main",
      alternative1ExerciseId: null,
      alternative2ExerciseId: "ex-alt-2",
    });

    expect(result).toEqual({
      alternative1ExerciseId: "ex-alt-2",
      alternative2ExerciseId: null,
    });
  });
});
