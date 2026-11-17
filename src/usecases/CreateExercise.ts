import { validateAndSanitizeMuscles } from "../domain/muscle-taxonomy.js";
import { ConflictError, ValidationError } from "../errors/index.js";
import { MuscleGroup, MuscleRole, Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import {
  ExerciseDemonstrationSchema,
  type ExerciseDemonstrationInput,
} from "../schemas/exercise-demonstration.js";

interface InputDto {
  demonstration?: ExerciseDemonstrationInput;
  userId: string;
  name: string;
  isUnilateral?: boolean;
  primaryMuscleGroups?: MuscleGroup[];
  secondaryMuscleGroups?: MuscleGroup[];
}

interface OutputDto {
  hasMedia?: boolean;
  id: string;
  name: string;
  ownerUserId: string;
  isUnilateral: boolean;
  muscles: Array<{
    id: string;
    muscleGroup: MuscleGroup;
    role: MuscleRole;
  }>;
}

export class CreateExercise {
  async execute(dto: InputDto): Promise<OutputDto> {
    const demonstration = dto.demonstration
      ? ExerciseDemonstrationSchema.parse(dto.demonstration)
      : undefined;
    const trimmedName = dto.name.trim();

    if (!trimmedName) {
      throw new ValidationError("Exercise name cannot be empty");
    }

    const { primary, secondary } = validateAndSanitizeMuscles(
      dto.primaryMuscleGroups,
      dto.secondaryMuscleGroups,
    );

    try {
      const existing = await prisma.exercise.findFirst({
        where: {
          ownerUserId: dto.userId,
          name: { equals: trimmedName, mode: "insensitive" },
        },
      });

      if (existing) {
        throw new ConflictError("An exercise with this name already exists");
      }

      const exercise = await prisma.exercise.create({
        data: {
          id: crypto.randomUUID(),
          name: trimmedName,
          ownerUserId: dto.userId,
          isUnilateral: dto.isUnilateral ?? false,
          ...(demonstration &&
          (demonstration.youtubeUrl || demonstration.animationKey)
            ? {
                demonstrations: {
                  create: { ownerUserId: dto.userId, ...demonstration },
                },
              }
            : {}),
          muscles: {
            create: [
              ...primary.map((mg) => ({
                id: crypto.randomUUID(),
                muscleGroup: mg,
                role: MuscleRole.PRIMARY,
              })),
              ...secondary.map((mg) => ({
                id: crypto.randomUUID(),
                muscleGroup: mg,
                role: MuscleRole.SECONDARY,
              })),
            ],
          },
        },
        include: {
          muscles: {
            select: {
              id: true,
              muscleGroup: true,
              role: true,
            },
            orderBy: [{ role: "asc" }, { muscleGroup: "asc" }],
          },
        },
      });

      return {
        hasMedia: Boolean(
          demonstration?.youtubeUrl || demonstration?.animationKey,
        ),
        id: exercise.id,
        name: exercise.name,
        ownerUserId: dto.userId,
        isUnilateral: exercise.isUnilateral,
        muscles: exercise.muscles,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictError("An exercise with this name already exists");
      }
      throw error;
    }
  }
}
