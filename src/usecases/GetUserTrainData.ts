import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import { GamificationTheme } from "../schemas/index.js";

interface InputDto {
  userId: string;
}

interface OutputDto {
  userId: string;
  userName: string;
  weightInGrams: number;
  heightInCentimeters: number;
  age: number;
  bodyFatPercentage: number | null;
  gamificationTheme: GamificationTheme;
  previousWeightInGrams?: number | null;
  previousBodyFatPercentage?: number | null;
  weightDiffInGrams?: number | null;
  bodyFatDiff?: number | null;
}

export class GetUserTrainData {
  async execute(dto: InputDto): Promise<OutputDto | null> {
    const user = await prisma.user.findUnique({
      where: { id: dto.userId },
      include: {
        metricLogs: {
          orderBy: { loggedAt: "desc" },
          take: 2,
        },
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (
      user.weightInGrams === null ||
      user.heightInCentimeters === null ||
      user.age === null
    ) {
      return null;
    }

    let previousWeightInGrams: number | null = null;
    let previousBodyFatPercentage: number | null = null;
    let weightDiffInGrams: number | null = null;
    let bodyFatDiff: number | null = null;

    if (user.metricLogs && user.metricLogs.length >= 2) {
      const prev = user.metricLogs[1];
      previousWeightInGrams = prev.weightInGrams;
      previousBodyFatPercentage = prev.bodyFatPercentage ?? null;
      weightDiffInGrams = user.weightInGrams - prev.weightInGrams;
      if (
        user.bodyFatPercentage !== null &&
        prev.bodyFatPercentage !== null &&
        prev.bodyFatPercentage !== undefined
      ) {
        bodyFatDiff = user.bodyFatPercentage - prev.bodyFatPercentage;
      }
    }

    return {
      userId: user.id,
      userName: user.name,
      weightInGrams: user.weightInGrams,
      heightInCentimeters: user.heightInCentimeters,
      age: user.age,
      bodyFatPercentage: user.bodyFatPercentage,
      gamificationTheme:
        (user.gamificationTheme as GamificationTheme) || GamificationTheme.ALL,
      previousWeightInGrams,
      previousBodyFatPercentage,
      weightDiffInGrams,
      bodyFatDiff,
    };
  }
}
