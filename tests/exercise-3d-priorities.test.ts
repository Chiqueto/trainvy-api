import { describe, expect, it } from "vitest";

import { CANONICAL_GLOBAL_CATALOG } from "../src/domain/canonical-catalog.js";
import plan from "../src/domain/exercise-3d-priority.json" with { type: "json" };
import expansion from "../src/domain/exercise-catalog-expansion.json" with { type: "json" };
import { AdminExerciseCatalog } from "../src/schemas/admin-exercises.js";

describe("3D production plan integrity", () => {
  it("covers every existing canonical ID exactly once with a unique contiguous order", () => {
    const ids = [...CANONICAL_GLOBAL_CATALOG, ...expansion].map(e => e.id);
    expect(plan).toHaveLength(ids.length);
    expect(new Set(plan.map(e => e.exerciseId)).size).toBe(ids.length);
    expect(plan.map(e => e.exerciseId).sort()).toEqual(ids.sort());
    expect(plan.map(e => e.order).sort((a,b) => a-b)).toEqual(Array.from({length: ids.length}, (_, i) => i+1));
    expect(plan.every((e, i) => !i || e.tier >= plan[i-1].tier)).toBe(true);
  });
  it("keeps each entry attached to its own exercise and valid API metadata", () => {
    const names = new Map([...CANONICAL_GLOBAL_CATALOG, ...expansion].map(e => [e.id, e.name]));
    for (const item of plan) {
      expect(item.exerciseName).toBe(names.get(item.exerciseId));
      expect(item.reason.length).toBeGreaterThan(30);
      expect(AdminExerciseCatalog.safeParse([{id: item.exerciseId, name: item.exerciseName, isUnilateral: false, family: null, updatedAt: "2026-10-27T12:00:00Z", priority3d: item, groups: ["RESISTANCE"], review: null, muscles: [], media: []}]).success).toBe(true);
    }
  });
});
