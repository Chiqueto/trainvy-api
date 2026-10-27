import type z from "zod";

import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import {
  SportsProfileBody,
  SportsProfileResponse,
} from "../schemas/sports-profile.js";

const select = {
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
    return SportsProfileResponse.parse(user);
  }
}
export class UpdateSportsProfile {
  async execute(userId: string, input: z.input<typeof SportsProfileBody>) {
    const data = SportsProfileBody.parse(input);
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...data,
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
    return SportsProfileResponse.parse(user);
  }
}
