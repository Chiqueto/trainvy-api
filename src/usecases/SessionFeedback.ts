import z from "zod";
import { ConflictError, NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import { SessionFeedbackBody, SessionFeedbackResponse } from "../schemas/session-feedback.js";

export class GetSessionFeedback {
  async execute(userId: string, sessionId: string) {
    const session = await prisma.workoutSession.findFirst({ where: { id: sessionId, athleteId: userId }, include: { feedback: true } });
    if (!session) throw new NotFoundError("Sessão não encontrada.");
    return session.feedback ? SessionFeedbackResponse.parse({ ...session.feedback, updatedAt: session.feedback.updatedAt.toISOString() }) : null;
  }
}

export class SaveSessionFeedback {
  async execute(userId: string, sessionId: string, input: z.input<typeof SessionFeedbackBody>) {
    const data = SessionFeedbackBody.parse(input);
    const feedback = await prisma.$transaction(async tx => {
      const session = await tx.workoutSession.findFirst({ where: { id: sessionId, athleteId: userId } });
      if (!session) throw new NotFoundError("Sessão não encontrada.");
      if (!session.completedAt) throw new ConflictError("Conclua o treino antes de avaliar a sessão.", "SESSION_NOT_COMPLETED");
      return tx.workoutSessionFeedback.upsert({
        where: { workoutSessionId: sessionId },
        create: { workoutSessionId: sessionId, ...data, notes: data.notes || null },
        update: { ...data, notes: data.notes || null },
      });
    });
    return SessionFeedbackResponse.parse({ ...feedback, updatedAt: feedback.updatedAt.toISOString() });
  }
}

export class GetRecentTrainingFeedback {
  async execute(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { aiTrainingHistoryAccess: true } });
    if (!user?.aiTrainingHistoryAccess) return { consentRequired: true, feedback: [] };
    const feedback = await prisma.workoutSessionFeedback.findMany({
      where: { workoutSession: { athleteId: userId, completedAt: { not: null } } },
      orderBy: { updatedAt: "desc" }, take: 10,
      select: { feeling: true, pain: true, fatigue: true, sleepQuality: true, notes: true, updatedAt: true,
        workoutSession: { select: { id: true, sessionDate: true, completedAt: true, workoutDayNameSnapshot: true } } },
    });
    return { consentRequired: false, feedback };
  }
}
