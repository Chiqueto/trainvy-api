import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
}

export interface UserAiConsentOutputDto {
  aiTrainingHistoryAccess: boolean;
  aiTrainingHistoryConsentAt: string | null;
}

export class GetUserAiConsent {
  async execute(dto: InputDto): Promise<UserAiConsentOutputDto> {
    const user = await prisma.user.findUnique({
      where: { id: dto.userId },
      select: {
        aiTrainingHistoryAccess: true,
        aiTrainingHistoryConsentAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return {
      aiTrainingHistoryAccess: user.aiTrainingHistoryAccess,
      aiTrainingHistoryConsentAt: user.aiTrainingHistoryConsentAt
        ? user.aiTrainingHistoryConsentAt.toISOString()
        : null,
    };
  }
}
