import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { FeedbackCategory } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

dayjs.extend(utc);

export interface CreateFeedbackInput {
  userId: string;
  category: keyof typeof FeedbackCategory;
  message: string;
}

export interface CreateFeedbackOutput {
  id: string;
}

export class CreateFeedback {
  async execute(input: CreateFeedbackInput): Promise<CreateFeedbackOutput> {
    const { userId, category, message } = input;

    if (!message || message.trim().length < 5) {
      throw new Error("A mensagem deve conter ao menos 5 caracteres.");
    }

    // 1. Anti-spam: limita a 5 feedbacks por hora por atleta
    const oneHourAgo = dayjs.utc().subtract(1, "hour").toDate();
    const recentFeedbacksCount = await prisma.feedback.count({
      where: {
        userId,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentFeedbacksCount >= 5) {
      throw new Error(
        "Você enviou muitos feedbacks recentemente. Aguarde um momento antes de enviar outro.",
      );
    }

    // 2. Persistência com vínculo estrito ao usuário autenticado
    const feedback = await prisma.feedback.create({
      data: {
        userId,
        category: category as FeedbackCategory,
        message: message.trim(),
      },
      select: {
        id: true,
      },
    });

    return {
      id: feedback.id,
    };
  }
}
