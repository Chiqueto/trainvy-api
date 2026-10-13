import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  periodizationId: string;
}

export class DeletePeriodization {
  async execute(dto: InputDto): Promise<{ success: boolean; message: string }> {
    const periodization = await prisma.periodization.findFirst({
      where: {
        id: dto.periodizationId,
        userId: dto.userId,
        deletedAt: null,
      },
      include: {
        plans: true,
      },
    });

    if (!periodization) {
      throw new NotFoundError("Periodização não encontrada.");
    }

    await prisma.$transaction(async (tx) => {
      // Se a periodização estava ativa, desativa qualquer plano ativado por ela
      if (periodization.isActive) {
        const planIds = periodization.plans.map((p) => p.workoutPlanId);
        if (planIds.length > 0) {
          await tx.workoutPlan.updateMany({
            where: {
              id: { in: planIds },
              isActive: true,
            },
            data: {
              isActive: false,
            },
          });
        }
      }

      await tx.periodization.update({
        where: {
          id: dto.periodizationId,
        },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });
    });

    return {
      success: true,
      message: "Periodização excluída com sucesso.",
    };
  }
}
