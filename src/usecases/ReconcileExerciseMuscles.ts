import {
  catalogFingerprint,
  CatalogReviewEntry,
  muscleSignature,
  REVIEWED_EXERCISES,
  type ReviewedExercise,
  reviewedMuscles,
} from "../domain/exercise-catalog-review.js";
import { prisma } from "../lib/db.js";

/** Explicit operational reconciliation. Never runs during startup, requests or seeds. */
export class ReconcileExerciseMuscles {
  constructor(
    private readonly definitions: ReviewedExercise[] = REVIEWED_EXERCISES,
  ) {}

  async execute(options: { apply: boolean; expectedFingerprint?: string }) {
    const definitions = this.definitions.map((e) =>
      CatalogReviewEntry.parse(e),
    );
    const byId = new Map(definitions.map((e) => [e.id, e]));
    if (byId.size !== definitions.length)
      throw new Error("Duplicate review IDs");
    return prisma.$transaction(
      async (tx) => {
        // Same row lock as the admin editor. Deterministic order prevents deadlocks.
        await tx.$queryRaw`SELECT id FROM "Exercise" WHERE "ownerUserId" IS NULL ORDER BY id FOR UPDATE`;
        const snapshot = await tx.exercise.findMany({
          where: { ownerUserId: null },
          include: { muscles: true },
          orderBy: { id: "asc" },
        });
        const fingerprint = catalogFingerprint(snapshot);
        if (
          options.apply &&
          (!options.expectedFingerprint ||
            options.expectedFingerprint !== fingerprint)
        )
          throw new Error("Catalog changed since snapshot; run a new dry-run");
        const unknown = snapshot
          .filter((e) => !byId.has(e.id) || byId.get(e.id)!.name !== e.name)
          .map((e) => ({ id: e.id, name: e.name }));
        if (unknown.length)
          throw new Error(
            `Unreviewed or renamed global exercises: ${JSON.stringify(unknown)}`,
          );
        const changes = snapshot.flatMap((e) => {
          const definition = byId.get(e.id)!;
          const after = reviewedMuscles(definition);
          return muscleSignature(e.muscles) === muscleSignature(after)
            ? []
            : [
                {
                  id: e.id,
                  name: e.name,
                  before: e.muscles.map(({ muscleGroup, role }) => ({
                    muscleGroup,
                    role,
                  })),
                  after,
                },
              ];
        });
        if (options.apply && changes.length) {
          const ids = changes.map((e) => e.id);
          await tx.exerciseMuscle.deleteMany({
            where: { exerciseId: { in: ids }, exercise: { ownerUserId: null } },
          });
          await tx.exerciseMuscle.createMany({
            data: changes.flatMap((e) =>
              e.after.map((m) => ({ exerciseId: e.id, ...m })),
            ),
          });
          // Bump Exercise.updatedAt so the athlete's existing catalog cache refreshes.
          await tx.exercise.updateMany({
            where: { id: { in: ids }, ownerUserId: null },
            data: { updatedAt: new Date() },
          });
        }
        return {
          apply: options.apply,
          total: snapshot.length,
          fingerprint,
          changed: options.apply ? changes.length : 0,
          planned: changes.length,
          unchanged: snapshot.length - changes.length,
          changes,
        };
      },
      { timeout: 60000 },
    );
  }
}
