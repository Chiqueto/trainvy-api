import type z from "zod";

import { muscleSignature } from "../domain/exercise-catalog-review.js";
import { prisma } from "../lib/db.js";
import { AdminError, assertAdminUser } from "../lib/require-admin.js";
import { AdminExerciseMusclesBody } from "../schemas/admin-exercises.js";

export class UpdateAdminExerciseMuscles {
  async execute(
    adminUserId: string,
    exerciseId: string,
    input: z.input<typeof AdminExerciseMusclesBody>,
  ) {
    const body = AdminExerciseMusclesBody.parse(input);
    return prisma.$transaction(async (tx) => {
      await assertAdminUser(tx, adminUserId);
      await tx.$queryRaw`SELECT id FROM "Exercise" WHERE id = ${exerciseId} AND "ownerUserId" IS NULL FOR UPDATE`;
      const exercise = await tx.exercise.findFirst({
        where: { id: exerciseId, ownerUserId: null },
        include: { muscles: true },
      });
      if (!exercise) throw new AdminError("EXERCISE_NOT_FOUND", 404);
      if (
        exercise.updatedAt.getTime() !==
        new Date(body.expectedUpdatedAt).getTime()
      )
        throw new AdminError("EXERCISE_CHANGED", 409);
      const muscles = [
        ...body.primaryMuscleGroups.map((muscleGroup) => ({
          muscleGroup,
          role: "PRIMARY" as const,
        })),
        ...body.secondaryMuscleGroups.map((muscleGroup) => ({
          muscleGroup,
          role: "SECONDARY" as const,
        })),
      ];
      if (muscleSignature(exercise.muscles) === muscleSignature(muscles))
        return {
          id: exercise.id,
          updatedAt: exercise.updatedAt.toISOString(),
          muscles,
        };
      const before = exercise.muscles.map(({ muscleGroup, role }) => ({
        muscleGroup,
        role,
      }));
      await tx.exerciseMuscle.deleteMany({
        where: { exerciseId: exercise.id },
      });
      await tx.exerciseMuscle.createMany({
        data: muscles.map((m) => ({ exerciseId: exercise.id, ...m })),
      });
      const updated = await tx.exercise.update({
        where: { id: exercise.id },
        data: { updatedAt: new Date() },
      });
      await tx.adminAuditLog.create({
        data: {
          adminUserId,
          action: "EXERCISE_MUSCLES_UPDATED",
          entityType: "EXERCISE",
          entityId: exercise.id,
          before: { muscles: before },
          after: { muscles },
        },
      });
      return {
        id: exercise.id,
        updatedAt: updated.updatedAt.toISOString(),
        muscles,
      };
    });
  }
}
