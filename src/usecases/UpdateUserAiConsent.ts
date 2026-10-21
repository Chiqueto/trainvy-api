import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import { UserAiConsentOutputDto } from "./GetUserAiConsent.js";

interface InputDto {
  userId: string;
  aiTrainingHistoryAccess: boolean;
}

export class UpdateUserAiConsent {
  async execute(dto: InputDto): Promise<UserAiConsentOutputDto> {
    const user = await prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    const consentAt = dto.aiTrainingHistoryAccess ? new Date() : null;

    const updated = await prisma.user.update({
      where: { id: dto.userId },
      data: {
        aiTrainingHistoryAccess: dto.aiTrainingHistoryAccess,
        aiTrainingHistoryConsentAt: consentAt,
      },
      select: {
        aiTrainingHistoryAccess: true,
        aiTrainingHistoryConsentAt: true,
      },
    });

    return {
      aiTrainingHistoryAccess: updated.aiTrainingHistoryAccess,
      aiTrainingHistoryConsentAt: updated.aiTrainingHistoryConsentAt
        ? updated.aiTrainingHistoryConsentAt.toISOString()
        : null,
    };
  }
}
