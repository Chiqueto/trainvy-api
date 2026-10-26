import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  workoutSessionId?: string | null;
}

export interface AiConversationSummaryDto {
  id: string;
  title: string;
  workoutSessionId?: string | null;
  createdAt: string;
  updatedAt: string;
  messagesCount: number;
}

export class ListAiConversations {
  async execute(dto: InputDto): Promise<AiConversationSummaryDto[]> {
    const whereClause: { userId: string; workoutSessionId?: string | null } = {
      userId: dto.userId,
    };

    if (dto.workoutSessionId !== undefined) {
      whereClause.workoutSessionId = dto.workoutSessionId;
    } else {
      whereClause.workoutSessionId = null;
    }

    const conversations = await prisma.aiConversation.findMany({
      where: whereClause,
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      workoutSessionId: c.workoutSessionId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      messagesCount: c._count.messages,
    }));
  }
}
