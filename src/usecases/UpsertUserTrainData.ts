import { ageFromBirthDate, birthDateString } from "../domain/birth-date.js";
import { prisma } from "../lib/db.js";
import {
  GamificationTheme,
  UserTrainDataBodySchema,
} from "../schemas/index.js";

interface InputDto {
  userId: string;
  weightInGrams: number;
  heightInCentimeters: number;
  age?: number;
  birthDate?: string;
  trainingGoals?: string;
  bodyFatPercentage?: number | null;
  gamificationTheme?: GamificationTheme;
}

interface OutputDto {
  userId: string;
  weightInGrams: number;
  heightInCentimeters: number;
  age: number;
  birthDate: string | null;
  bodyFatPercentage: number | null;
  gamificationTheme: GamificationTheme;
}

export class UpsertUserTrainData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const input = UserTrainDataBodySchema.parse(dto);
    const user = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUniqueOrThrow({
        where: { id: dto.userId },
        select: { birthDate: true },
      });
      const birthDate = input.birthDate ?? birthDateString(current.birthDate);
      const age = birthDate ? ageFromBirthDate(birthDate) : input.age!;
      const updated = await tx.user.update({
        where: { id: dto.userId },
        data: {
          weightInGrams: dto.weightInGrams,
          heightInCentimeters: dto.heightInCentimeters,
          age,
          ...(input.birthDate
            ? { birthDate: new Date(`${input.birthDate}T00:00:00.000Z`) }
            : {}),
          ...(input.trainingGoals !== undefined
            ? { trainingGoals: input.trainingGoals }
            : {}),
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
          age,
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
      birthDate: birthDateString(user.birthDate),
      bodyFatPercentage: user.bodyFatPercentage,
      gamificationTheme:
        (user.gamificationTheme as GamificationTheme) || GamificationTheme.ALL,
    };
  }
}
