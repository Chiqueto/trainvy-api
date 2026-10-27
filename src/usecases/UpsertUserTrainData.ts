import { prisma } from "../lib/db.js";
import { GamificationTheme } from "../schemas/index.js";

interface InputDto {
  userId: string;
  weightInGrams: number;
  heightInCentimeters: number;
  age: number;
  bodyFatPercentage?: number | null;
  gamificationTheme?: GamificationTheme;
}

interface OutputDto {
  userId: string;
  weightInGrams: number;
  heightInCentimeters: number;
  age: number;
  bodyFatPercentage: number | null;
  gamificationTheme: GamificationTheme;
}

export class UpsertUserTrainData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: dto.userId },
        data: {
          weightInGrams: dto.weightInGrams,
          heightInCentimeters: dto.heightInCentimeters,
          age: dto.age,
          ...(dto.bodyFatPercentage !== undefined
            ? { bodyFatPercentage: dto.bodyFatPercentage }
            : {}),
          ...(dto.gamificationTheme
            ? { gamificationTheme: dto.gamificationTheme }
            : {}),
        },
      });
      await tx.userMetricLog.create({
        data: {
          userId: dto.userId,
          weightInGrams: dto.weightInGrams,
          heightInCentimeters: dto.heightInCentimeters,
          age: dto.age,
          bodyFatPercentage: updated.bodyFatPercentage,
        },
      });
      return updated;
    });

    return {
      userId: user.id,
      weightInGrams: user.weightInGrams!,
      heightInCentimeters: user.heightInCentimeters!,
      age: user.age!,
      bodyFatPercentage: user.bodyFatPercentage,
      gamificationTheme:
        (user.gamificationTheme as GamificationTheme) || GamificationTheme.ALL,
    };
  }
}
