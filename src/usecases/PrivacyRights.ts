import { CoachAthleteError } from "../domain/coach-athlete.js";
import { maskedStoredCpf } from "../domain/protected-cpf.js";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";

export class PrivacyRights {
  async export(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        birthDate: true,
        weightInGrams: true,
        heightInCentimeters: true,
        age: true,
        bodyFatPercentage: true,
        availableEquipment: true,
        accountType: true,
        createdAt: true,
        subscription: true,
        billingCustomers: true,
        notificationPreferences: true,
        trainingGoals: true,
        trainingRestrictions: true,
        experienceLevel: true,
        workoutPlans: {
          include: { workoutDays: { include: { exercises: true } } },
        },
        workoutSessions: {
          include: {
            sessionExercises: { include: { sets: true } },
            feedback: true,
          },
        },
        metricLogs: true,
        aiConversations: { include: { messages: true } },
        legalAcceptances: true,
        featureTermsAcceptances: { include: { accessEvents: true } },
        athletePrescriptions: true,
        coachPrescriptions: true,
        professionalRegistration: true,
        coachAthletesAsAthlete: true,
        coachAthletesAsCoach: true,
        periodizations: { include: { plans: true } },
        feedbacks: true,
      },
    });
    const accessLogs = await prisma.applicationAccessLog.findMany({
      where: { userId },
      orderBy: { accessedAt: "desc" },
    });
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        formatVersion: "1.0.0",
        user: {
          ...user,
          professionalRegistration: user.professionalRegistration
            ? { ...user.professionalRegistration, cpf: maskedStoredCpf(user.professionalRegistration.cpf) }
            : null,
        },
        accessLogs,
      },
      null,
      2,
    );
  }
  async revokeHealth(userId: string) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
      await tx.userLegalAcceptance.updateMany({
        where: {
          userId,
          documentSlug: "termo-saude-parq-lgpd",
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          aiTrainingHistoryAccess: false,
          aiTrainingHistoryConsentAt: null,
        },
      });
    });
    return { success: true as const };
  }
  async erase(userId: string, confirmation: string) {
    if (confirmation !== "EXCLUIR MINHA CONTA")
      throw new CoachAthleteError("CONFIRMATION_REQUIRED", 400);
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
        await tx.coachAthlete.updateMany({
          where: { OR: [{ coachId: userId }, { athleteId: userId }] },
          data: {
            status: "REVOKED",
            revokedAt: new Date(),
            revokedByUserId: userId,
            evolutionShared: false,
            evolutionRevokedAt: new Date(),
          },
        });
        await tx.coachInvitation.updateMany({
          where: { coachId: userId, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
        await tx.aiConversation.deleteMany({ where: { userId } });
        await tx.aiToolExecution.deleteMany({ where: { userId } });
        await tx.forgottenWorkoutDraft.deleteMany({ where: { userId } });
        await tx.workoutSession.deleteMany({ where: { athleteId: userId } });
        await tx.userMetricLog.deleteMany({ where: { userId } });
        await tx.feedback.deleteMany({ where: { userId } });
        await tx.aiUsageEvent.deleteMany({ where: { userId } });
        await tx.aiUsageDaily.deleteMany({ where: { userId } });
        await tx.aiRequestLog.deleteMany({ where: { userId } });
        await tx.pushSubscription.deleteMany({ where: { userId } });
        await tx.notification.deleteMany({ where: { userId } });
        await tx.notificationPreferences.deleteMany({ where: { userId } });
        await tx.featureAccessEvent.deleteMany({
          where: { acceptance: { userId } },
        });
        await tx.featureTermsAcceptance.deleteMany({ where: { userId } });
        await tx.userLegalAcceptance.deleteMany({ where: { userId } });
        await tx.adminAuditLog.updateMany({
          where: { targetUserId: userId },
          data: {
            before: Prisma.JsonNull,
            after: Prisma.JsonNull,
            metadata: Prisma.JsonNull,
          },
        });
        await tx.session.deleteMany({ where: { userId } });
        await tx.account.deleteMany({ where: { userId } });
        await tx.workoutExercise.deleteMany({
          where: { workoutDay: { workoutPlan: { userId } } },
        });
        await tx.workoutDay.deleteMany({ where: { workoutPlan: { userId } } });
        await tx.periodizationPlan.deleteMany({
          where: {
            OR: [{ workoutPlan: { userId } }, { periodization: { userId } }],
          },
        });
        await tx.workoutPlan.deleteMany({ where: { userId } });
        await tx.periodization.deleteMany({ where: { userId } });
        await tx.workoutPlanTemplate.deleteMany({ where: { coachId: userId } });
        await tx.exercise.deleteMany({ where: { ownerUserId: userId } });
        await tx.professionalVerificationReview.deleteMany({
          where: { userId },
        });
        await tx.professionalRegistration.deleteMany({ where: { userId } });
        await tx.workoutPrescription.deleteMany({
          where: {
            OR: [{ coachId: userId }, { athleteId: userId }],
            approvedAt: null,
          },
        });
        await tx.subscription.updateMany({
          where: { userId },
          data: { status: "CANCELED" },
        });
        await tx.user.update({
          where: { id: userId },
          data: {
            name: "Conta excluída",
            systemRole: "USER",
            accountType: "ATHLETE",
            email: `${userId}@deleted.invalid`,
            emailVerified: false,
            image: null,
            deletedAt: new Date(),
            weightInGrams: null,
            heightInCentimeters: null,
            age: null,
            birthDate: null,
            bodyFatPercentage: null,
            trainingGoals: null,
            experienceLevel: null,
            availableEquipment: [],
            trainingRestrictions: null,
            aiTrainingHistoryAccess: false,
          },
        });
      },
      { timeout: 20000 },
    );
    return { success: true as const };
  }
}
