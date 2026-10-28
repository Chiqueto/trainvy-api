import type z from "zod";

import { ageFromBirthDate, birthDateString } from "../domain/birth-date.js";
import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import {
  SportsProfileBody,
  SportsProfileResponse,
} from "../schemas/sports-profile.js";

const select = {
  birthDate: true,
  trainingGoals: true,
  experienceLevel: true,
  availableEquipment: true,
  trainingRestrictions: true,
} as const;
export class GetSportsProfile {
  async execute(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select,
    });
    if (!user) throw new NotFoundError("Usuário não encontrado.");
    return SportsProfileResponse.parse({
      ...user,
      birthDate: birthDateString(user.birthDate),
    });
  }
}
export class UpdateSportsProfile {
  async execute(userId: string, input: z.input<typeof SportsProfileBody>) {
    const data = SportsProfileBody.parse(input);
    const { birthDate, ...sportsData } = data;
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...sportsData,
        ...(birthDate
          ? {
              birthDate: new Date(`${birthDate}T00:00:00.000Z`),
              age: ageFromBirthDate(birthDate),
            }
          : {}),
        ...(data.trainingGoals !== undefined
          ? { trainingGoals: data.trainingGoals || null }
          : {}),
        ...(data.trainingRestrictions !== undefined
          ? { trainingRestrictions: data.trainingRestrictions || null }
          : {}),
        ...(data.availableEquipment
          ? { availableEquipment: [...new Set(data.availableEquipment)] }
          : {}),
      },
      select,
    });
    return SportsProfileResponse.parse({
      ...user,
      birthDate: birthDateString(user.birthDate),
    });
  }
}
