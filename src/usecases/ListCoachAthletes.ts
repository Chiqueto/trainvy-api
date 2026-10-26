import {
  assertCoachCanManageAthletes,
  getCoachAthleteLimit,
} from "../domain/coach-athlete.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class ListCoachAthletes {
  async execute({ coachId }: { coachId: string }) {
    const commercialContext = await new GetCommercialContext().execute({
      userId: coachId,
    });

    assertCoachCanManageAthletes(commercialContext);

    const limit = getCoachAthleteLimit(commercialContext);

    const links = await prisma.coachAthlete.findMany({
      where: {
        coachId,
        status: "ACTIVE",
      },
      include: {
        athlete: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (links.length === 0) {
      return {
        athletes: [],
        activeCount: 0,
        limit: limit ?? null,
        summary: {
          totalAthletes: 0,
          activeThisWeekCount: 0,
          atRiskCount: 0,
          pendingPrescriptionsCount: 0,
          withoutPlanCount: 0,
        },
      };
    }

    const athleteIds = links.map((l) => l.athleteId);

    // 1. Filtrar atletas que autorizaram compartilhamento de evolução
    const authorizedLinks = links.filter((l) => l.evolutionShared);
    const authorizedAthleteIds = authorizedLinks.map((l) => l.athleteId);

    // 2. Buscar último treino concluído e treinos nos últimos 7 dias para atletas autorizados
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

    const lastSessions =
      authorizedAthleteIds.length > 0
        ? await prisma.workoutSession.groupBy({
            by: ["athleteId"],
            where: {
              athleteId: { in: authorizedAthleteIds },
              completedAt: { not: null },
            },
            _max: {
              completedAt: true,
            },
          })
        : [];

    const weekSessions =
      authorizedAthleteIds.length > 0
        ? await prisma.workoutSession.groupBy({
            by: ["athleteId"],
            where: {
              athleteId: { in: authorizedAthleteIds },
              completedAt: { gte: sevenDaysAgo },
            },
            _count: {
              id: true,
            },
          })
        : [];

    const lastSessionMap = new Map<string, Date>();
    for (const item of lastSessions) {
      if (item._max.completedAt) {
        lastSessionMap.set(item.athleteId, item._max.completedAt);
      }
    }

    const weekCountMap = new Map<string, number>();
    for (const item of weekSessions) {
      weekCountMap.set(item.athleteId, item._count.id);
    }

    // 3. Planos ativos dos atletas
    const activePlans = await prisma.workoutPlan.findMany({
      where: {
        userId: { in: athleteIds },
        isActive: true,
        deletedAt: null,
      },
      select: {
        userId: true,
        id: true,
        name: true,
      },
    });

    const activePlanMap = new Map<string, { id: string; name: string }>();
    for (const plan of activePlans) {
      activePlanMap.set(plan.userId, { id: plan.id, name: plan.name });
    }

    // 4. Prescrições do treinador para estes atletas
    const prescriptions = await prisma.workoutPrescription.findMany({
      where: {
        coachId,
        athleteId: { in: athleteIds },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        athleteId: true,
        status: true,
        name: true,
        updatedAt: true,
      },
    });

    const pendingCountMap = new Map<string, number>();
    const latestPrescriptionMap = new Map<
      string,
      {
        id: string;
        status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "CANCELLED";
        name: string;
        updatedAt: string;
      }
    >();

    for (const p of prescriptions) {
      if (p.status === "SENT") {
        pendingCountMap.set(
          p.athleteId,
          (pendingCountMap.get(p.athleteId) ?? 0) + 1,
        );
      }
      if (!latestPrescriptionMap.has(p.athleteId)) {
        latestPrescriptionMap.set(p.athleteId, {
          id: p.id,
          status: p.status,
          name: p.name,
          updatedAt: p.updatedAt.toISOString(),
        });
      }
    }

    let activeThisWeekCount = 0;
    let atRiskCount = 0;
    let totalPendingPrescriptions = 0;
    let withoutPlanCount = 0;

    const mappedAthletes = links.map((link) => {
      const athleteId = link.athlete.id;
      const hasPlan = activePlanMap.has(athleteId);
      const activePlan = activePlanMap.get(athleteId);
      const lastSessionDate = lastSessionMap.get(athleteId);
      const workoutsThisWeek = weekCountMap.get(athleteId) ?? 0;
      const pendingCount = pendingCountMap.get(athleteId) ?? 0;
      const activePrescription = latestPrescriptionMap.get(athleteId) ?? null;

      if (!hasPlan) {
        withoutPlanCount++;
      }

      if (workoutsThisWeek > 0) {
        activeThisWeekCount++;
      }

      if (pendingCount > 0) {
        totalPendingPrescriptions += pendingCount;
      }

      // Em risco: se compartilhou evolução e último treino foi há mais de 4 dias (ou nunca treinou)
      if (link.evolutionShared) {
        if (!lastSessionDate || lastSessionDate < fourDaysAgo) {
          atRiskCount++;
        }
      }

      return {
        linkId: link.id,
        athleteId,
        name: link.athlete.name,
        email: link.athlete.email,
        image: link.athlete.image,
        acceptedAt: link.createdAt.toISOString(),
        evolutionShared: link.evolutionShared,
        lastWorkoutSessionAt: lastSessionDate
          ? lastSessionDate.toISOString()
          : null,
        workoutsThisWeekCount: workoutsThisWeek,
        hasActiveWorkoutPlan: hasPlan,
        activeWorkoutPlanName: activePlan?.name ?? null,
        pendingPrescriptionsCount: pendingCount,
        activePrescription,
      };
    });

    return {
      athletes: mappedAthletes,
      activeCount: links.length,
      limit: limit ?? null,
      summary: {
        totalAthletes: links.length,
        activeThisWeekCount,
        atRiskCount,
        pendingPrescriptionsCount: totalPendingPrescriptions,
        withoutPlanCount,
      },
    };
  }
}
