import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
}

export interface MetricLogItem {
  id: string;
  weightInGrams: number;
  weightKg: number;
  heightInCentimeters: number | null;
  age: number | null;
  bodyFatPercentage: number | null;
  loggedAt: string;
  weightDiffInGrams: number | null;
  weightDiffKg: number | null;
  bodyFatDiff: number | null;
}

export class GetUserMetricsHistory {
  async execute(dto: InputDto): Promise<MetricLogItem[]> {
    const logs = await prisma.userMetricLog.findMany({
      where: { userId: dto.userId },
      orderBy: { loggedAt: "desc" },
    });

    return logs.map((entry, index) => {
      const older = logs[index + 1];
      const weightDiffInGrams = older ? entry.weightInGrams - older.weightInGrams : null;
      const weightDiffKg = weightDiffInGrams !== null ? Number((weightDiffInGrams / 1000).toFixed(2)) : null;

      const bodyFatDiff =
        older && entry.bodyFatPercentage !== null && older.bodyFatPercentage !== null
          ? entry.bodyFatPercentage - older.bodyFatPercentage
          : null;

      return {
        id: entry.id,
        weightInGrams: entry.weightInGrams,
        weightKg: Number((entry.weightInGrams / 1000).toFixed(2)),
        heightInCentimeters: entry.heightInCentimeters,
        age: entry.age,
        bodyFatPercentage: entry.bodyFatPercentage,
        loggedAt: entry.loggedAt.toISOString(),
        weightDiffInGrams,
        weightDiffKg,
        bodyFatDiff,
      };
    });
  }
}
