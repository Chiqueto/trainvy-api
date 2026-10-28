import { ExerciseInstructions } from "../domain/canonical-media-catalog.js";
import {
  getExerciseAnatomy,
  type ExerciseAnatomy,
} from "../domain/exercise-anatomy.js";
import { NotFoundError } from "../errors/index.js";
import { ExerciseMediaType } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

export interface GetExerciseMediaInputDto {
  userId: string;
  exerciseId: string;
}

export interface GetExerciseMediaOutputDto {
  anatomy?: ExerciseAnatomy | null;
  exerciseId: string;
  hasMedia: boolean;
  mediaType: ExerciseMediaType | null;
  startImagePath: string | null;
  endImagePath: string | null;
  motionPath: string | null;
  instructions: ExerciseInstructions | null;
  attributionName: string | null;
  attributionUrl: string | null;
}

export class GetExerciseMedia {
  async execute(
    dto: GetExerciseMediaInputDto,
  ): Promise<GetExerciseMediaOutputDto> {
    const exercise = await prisma.exercise.findUnique({
      where: { id: dto.exerciseId },
      include: {
        muscles: true,
        media: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    // Exercício não existe
    if (!exercise) {
      throw new NotFoundError("Exercise not found");
    }

    // Regra de segurança e autorização:
    // Permite apenas exercícios globais (ownerUserId === null)
    // ou exercícios customizados pertencentes ao próprio usuário autenticado.
    // Bloqueia acesso a exercícios privados de terceiros.
    if (exercise.ownerUserId !== null && exercise.ownerUserId !== dto.userId) {
      throw new NotFoundError("Exercise not found");
    }

    const activeMedia = exercise.media[0];
    const anatomy = getExerciseAnatomy(
      exercise.anatomyReview,
      exercise.muscles,
    );

    // Caso não possua mídia vinculada ou esteja inativa
    if (!activeMedia) {
      return {
        exerciseId: exercise.id,
        anatomy,
        hasMedia: false,
        mediaType: null,
        startImagePath: null,
        endImagePath: null,
        motionPath: null,
        instructions: anatomy?.instructions ?? null,
        attributionName: null,
        attributionUrl: null,
      };
    }

    return {
      exerciseId: exercise.id,
      anatomy,
      hasMedia: true,
      mediaType: activeMedia.mediaType,
      startImagePath: activeMedia.startImagePath,
      endImagePath: activeMedia.endImagePath,
      motionPath: activeMedia.motionPath,
      instructions:
        anatomy?.instructions ??
        (activeMedia.instructions as unknown as ExerciseInstructions),
      attributionName: activeMedia.attributionName,
      attributionUrl: activeMedia.attributionUrl,
    };
  }
}
