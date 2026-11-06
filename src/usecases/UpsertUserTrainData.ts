import { assertCoreLegalAcceptances, assertHealthConsent } from "./LegalCompliance.js";
import { CoachAthleteError } from "../domain/coach-athlete.js";
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
    await assertHealthConsent(dto.userId);
    await assertCoreLegalAcceptances(dto.userId);
    if (input.birthDate && ageFromBirthDate(input.birthDate) < 18) throw new CoachAthleteError("ADULT_ACCOUNT_REQUIRED", 403, "Contas autônomas exigem idade mínima de 18 anos.");
    const user = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUniqueOrThrow({
        where: { id: dto.userId },
        select: { birthDate: true },
      });
      const birthDate = input.birthDate ?? birthDateString(current.birthDate);
      if (!birthDate) throw new CoachAthleteError("BIRTH_DATE_REQUIRED", 403, "Informe a data de nascimento para confirmar a maioridade.");
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
