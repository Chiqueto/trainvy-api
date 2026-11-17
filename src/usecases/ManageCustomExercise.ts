import { MuscleGroup, MuscleRole } from "../generated/prisma/enums.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";
import {
  ExerciseDemonstrationSchema,
  type ExerciseDemonstrationInput,
} from "../schemas/exercise-demonstration.js";

import {
  readMuscleDetails,
  validateMuscleDetails,
  type MuscleDetails,
} from "../domain/muscle-details.js";

export class DeleteCustomExercise {
  async execute({
    userId,
    exerciseId,
  }: {
    userId: string;
    exerciseId: string;
  }) {
    const exercise = await prisma.exercise.findUnique({
      where: { id: exerciseId },
    });

    if (!exercise || exercise.ownerUserId !== userId) {
      throw new NotFoundError(
        "Exercício não encontrado ou você não tem permissão para excluí-lo.",
        "EXERCISE_NOT_FOUND",
      );
    }

    await prisma.exercise.delete({
      where: { id: exerciseId },
    });

    return { success: true };
  }
}

export interface UpdateCustomExerciseInput {
  muscleDetails?: MuscleDetails;
  demonstration?: ExerciseDemonstrationInput;
  userId: string;
  exerciseId: string;
  name?: string;
  isUnilateral?: boolean;
  primaryMuscleGroups?: MuscleGroup[];
  secondaryMuscleGroups?: MuscleGroup[];
}

export class UpdateCustomExercise {
  async execute(dto: UpdateCustomExerciseInput) {
    const demonstration = dto.demonstration
      ? ExerciseDemonstrationSchema.parse(dto.demonstration)
      : undefined;
    const existing = await prisma.exercise.findUnique({
      where: { id: dto.exerciseId },
      include: { muscles: true },
    });

    if (!existing || existing.ownerUserId !== dto.userId) {
      throw new NotFoundError(
        "Exercício não encontrado ou você não tem permissão para alterá-lo.",
        "EXERCISE_NOT_FOUND",
      );
    }

    const trimmedName =
      dto.name !== undefined ? dto.name.trim() : existing.name;
    if (!trimmedName) {
      throw new ValidationError("O nome do exercício não pode ser vazio.");
    }

    // Se o nome mudou, verificar unicidade entre os exercícios do próprio usuário
    if (trimmedName.toLowerCase() !== existing.name.toLowerCase()) {
      const conflict = await prisma.exercise.findFirst({
        where: {
          ownerUserId: dto.userId,
          name: {
            equals: trimmedName,
            mode: "insensitive",
          },
          id: { not: dto.exerciseId },
        },
      });

      if (conflict) {
        throw new ConflictError(
          "Você já possui outro exercício com este nome.",
          "EXERCISE_ALREADY_EXISTS",
        );
      }
    }

    const primary =
      dto.primaryMuscleGroups ??
      existing.muscles
        .filter((m) => m.role === "PRIMARY")
        .map((m) => m.muscleGroup);
    const secondary =
      dto.secondaryMuscleGroups ??
      existing.muscles
        .filter((m) => m.role === "SECONDARY")
        .map((m) => m.muscleGroup);
    const pairs = [
      ...primary.map((muscleGroup) => ({ muscleGroup, role: "PRIMARY" })),
      ...secondary.map((muscleGroup) => ({ muscleGroup, role: "SECONDARY" })),
    ];
    const muscleDetails =
      dto.muscleDetails === undefined
        ? readMuscleDetails(existing.muscleDetails, pairs)
        : validateMuscleDetails(dto.muscleDetails, primary, secondary);

    return await prisma.$transaction(async (tx) => {
      if (demonstration) {
        if (!demonstration.youtubeUrl && !demonstration.animationKey) {
          await tx.exerciseDemonstration.deleteMany({
            where: { exerciseId: dto.exerciseId, ownerUserId: dto.userId },
          });
        } else {
          await tx.exerciseDemonstration.upsert({
            where: {
              exerciseId_ownerUserId: {
                exerciseId: dto.exerciseId,
                ownerUserId: dto.userId,
              },
            },
            create: {
              exerciseId: dto.exerciseId,
              ownerUserId: dto.userId,
              ...demonstration,
            },
            update: demonstration,
          });
        }
      }
      // 1. Atualizar campos básicos
      const updatedExercise = await tx.exercise.update({
        where: { id: dto.exerciseId },
        data: {
          name: trimmedName,
          muscleDetails,
          isUnilateral:
            dto.isUnilateral !== undefined
              ? dto.isUnilateral
              : existing.isUnilateral,
        },
      });

      // 2. Se foram passados grupos musculares, substituir relações
      if (
        dto.primaryMuscleGroups !== undefined ||
        dto.secondaryMuscleGroups !== undefined
      ) {
        const primaries = primary;
        const secondaries = secondary;

        // Validar que nenhum grupo é primário e secundário simultaneamente
        for (const p of primaries) {
          if (secondaries.includes(p)) {
            throw new ValidationError(
              `O grupo muscular ${p} não pode ser primário e secundário simultaneamente.`,
            );
          }
        }

        // Remover existentes
        await tx.exerciseMuscle.deleteMany({
          where: { exerciseId: dto.exerciseId },
        });

        // Inserir novos primários
        if (primaries.length > 0) {
          await tx.exerciseMuscle.createMany({
            data: primaries.map((mg) => ({
              exerciseId: dto.exerciseId,
              muscleGroup: mg,
              role: MuscleRole.PRIMARY,
            })),
          });
        }

        // Inserir novos secundários
        if (secondaries.length > 0) {
          await tx.exerciseMuscle.createMany({
            data: secondaries.map((mg) => ({
              exerciseId: dto.exerciseId,
              muscleGroup: mg,
              role: MuscleRole.SECONDARY,
            })),
          });
        }
      }

      // Buscar estado final com músculos
      const finalExercise = await tx.exercise.findUniqueOrThrow({
        where: { id: dto.exerciseId },
        include: {
          muscles: true,
          media: { where: { isActive: true }, take: 1 },
          demonstrations: { where: { ownerUserId: dto.userId }, take: 1 },
        },
      });

      return {
        muscleDetails,
        demonstration: finalExercise.demonstrations[0]
          ? ExerciseDemonstrationSchema.parse(finalExercise.demonstrations[0])
          : null,
        id: finalExercise.id,
        name: finalExercise.name,
        ownerUserId: finalExercise.ownerUserId,
        isUnilateral: finalExercise.isUnilateral,
        hasMedia:
          finalExercise.media.length > 0 ||
          finalExercise.demonstrations.length > 0,
        muscles: finalExercise.muscles.map((m) => ({
          id: m.id,
          muscleGroup: m.muscleGroup,
          role: m.role,
        })),
      };
    });
  }
}
