import { ExerciseInstructions } from "../domain/canonical-media-catalog.js";
import { NotFoundError } from "../errors/index.js";
import { ExerciseMediaType } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

export interface GetExerciseMediaInputDto {
  userId: string;
  exerciseId: string;
}

export interface GetExerciseMediaOutputDto {
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
  async execute(dto: GetExerciseMediaInputDto): Promise<GetExerciseMediaOutputDto> {
    const exercise = await prisma.exercise.findUnique({
      where: { id: dto.exerciseId },
      include: {
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

    let activeMedia = exercise.media[0];

    // Fallback inteligente: se o exercício é customizado do usuário e não possui mídia própria,
    // herda a mídia do exercício canônico global de mesmo nome (se houver mídia cadastrada para ele).
    if (!activeMedia && exercise.ownerUserId !== null) {
      const matchingGlobal = await prisma.exercise.findFirst({
        where: {
          ownerUserId: null,
          name: { equals: exercise.name.trim(), mode: "insensitive" },
        },
        include: {
          media: {
            where: { isActive: true },
            take: 1,
          },
        },
      });

      if (matchingGlobal?.media?.[0]) {
        activeMedia = matchingGlobal.media[0];
      }
    }

    // Caso não possua mídia vinculada ou esteja inativa
    if (!activeMedia) {
      return {
        exerciseId: exercise.id,
        hasMedia: false,
        mediaType: null,
        startImagePath: null,
        endImagePath: null,
        motionPath: null,
        instructions: null,
        attributionName: null,
        attributionUrl: null,
      };
    }

    return {
      exerciseId: exercise.id,
      hasMedia: true,
      mediaType: activeMedia.mediaType,
      startImagePath: activeMedia.startImagePath,
      endImagePath: activeMedia.endImagePath,
      motionPath: activeMedia.motionPath,
      instructions: activeMedia.instructions as unknown as ExerciseInstructions,
      attributionName: activeMedia.attributionName,
      attributionUrl: activeMedia.attributionUrl,
    };
  }
}
