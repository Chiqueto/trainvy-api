import { prisma } from "../lib/db.js";
import { createExerciseThumbnailStorage } from "../lib/exercise-thumbnail-storage.js";

export class GetExerciseThumbnail {
  async execute(exerciseId: string) {
    const exercise = await prisma.exercise.findFirst({
      where: { id: exerciseId, ownerUserId: null },
      select: { thumbnailStorageKey: true },
    });
    if (!exercise?.thumbnailStorageKey) return null;

    const storage = createExerciseThumbnailStorage();
    return storage?.signRead(exercise.thumbnailStorageKey) ?? null;
  }
}
