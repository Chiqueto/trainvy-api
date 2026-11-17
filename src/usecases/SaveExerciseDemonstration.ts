import { assertCoachCanManageAthletes } from "../domain/coach-athlete.js";
import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import {
  ExerciseDemonstrationSchema,
  type ExerciseDemonstrationInput,
} from "../schemas/exercise-demonstration.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class SaveExerciseDemonstration {
  async execute(dto: {
    userId: string;
    exerciseId: string;
    demonstration: ExerciseDemonstrationInput;
  }) {
    const data = ExerciseDemonstrationSchema.parse(dto.demonstration);
    const exercise = await prisma.exercise.findFirst({
      where: {
        id: dto.exerciseId,
        OR: [{ ownerUserId: null }, { ownerUserId: dto.userId }],
      },
    });
    if (!exercise) throw new NotFoundError("Exercício não encontrado.");
    // Global catalog stays immutable: only the coach's private override is written.
    if (exercise.ownerUserId === null) {
      assertCoachCanManageAthletes(
        await new GetCommercialContext().execute({ userId: dto.userId }),
      );
    }
    if (!data.youtubeUrl && !data.animationKey) {
      await prisma.exerciseDemonstration.deleteMany({
        where: { exerciseId: dto.exerciseId, ownerUserId: dto.userId },
      });
    } else {
      await prisma.exerciseDemonstration.upsert({
        where: {
          exerciseId_ownerUserId: {
            exerciseId: dto.exerciseId,
            ownerUserId: dto.userId,
          },
        },
        create: {
          exerciseId: dto.exerciseId,
          ownerUserId: dto.userId,
          ...data,
        },
        update: data,
      });
    }
    return data;
  }
}
