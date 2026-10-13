import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  workoutPlanId: string;
}

export class DeleteWorkoutPlan {
  async execute(dto: InputDto): Promise<{ success: boolean; message: string }> {
    const workoutPlan = await prisma.workoutPlan.findFirst({
      where: {
        id: dto.workoutPlanId,
        userId: dto.userId,
        deletedAt: null,
      },
      include: {
        periodizationPlan: true,
      },
    });

    if (!workoutPlan) {
      throw new NotFoundError("Plano de treino não encontrado.");
    }

    await prisma.$transaction(async (tx) => {
      // Se estava associado a uma periodização, desassocia o bloco
      if (workoutPlan.periodizationPlan) {
        await tx.periodizationPlan.delete({
          where: {
            workoutPlanId: dto.workoutPlanId,
          },
        });
      }

      await tx.workoutPlan.update({
        where: {
          id: dto.workoutPlanId,
        },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });
    });

    return {
      success: true,
      message: "Plano de treino excluído com sucesso.",
    };
  }
}
