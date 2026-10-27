import priorityPlan from "../domain/exercise-3d-priority.json" with { type: "json" };
import expansion from "../domain/exercise-catalog-expansion.json" with { type: "json" };
import { prisma } from "../lib/db.js";
import { assertAdminUser } from "../lib/require-admin.js";

const families = new Map(expansion.map(e => [e.id, e.family]));
const priorities = new Map(priorityPlan.map(e => [e.exerciseId, e]));

export class ListAdminExercises {
  async execute(adminUserId: string) {
    await assertAdminUser(prisma, adminUserId);
    const exercises = await prisma.exercise.findMany({
      where: {ownerUserId: null}, orderBy: [{name: "asc"}, {id: "asc"}],
      include: {muscles: true, media: {where: {isActive: true}}},
    });
    return exercises.map(e => ({
      id: e.id, name: e.name, isUnilateral: e.isUnilateral,
      family: families.get(e.id) ?? null, updatedAt: e.updatedAt.toISOString(),
      priority3d: priorities.get(e.id) ?? null,
      muscles: e.muscles.map(m => ({muscleGroup: m.muscleGroup, role: m.role})),
      media: e.media.map(m => ({mediaType: m.mediaType,
        hasImages: Boolean(m.startImagePath || m.endImagePath),
        hasMotion: Boolean(m.motionPath),
        hasInstructions: Boolean(m.instructions && typeof m.instructions === "object" && Object.values(m.instructions).some(value => typeof value === "string" && value.trim())),
      })),
    }));
  }
}
