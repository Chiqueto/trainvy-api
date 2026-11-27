import { subscriptionGrantsAccess } from "./commercial.js";
import { ForbiddenError } from "../errors/index.js";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";

export type PlanLimitCode =
  | "ATHLETE_PLAN_LIMIT_REACHED"
  | "ATHLETE_WORKOUT_DAY_LIMIT_REACHED"
  | "PERIODIZATION_REQUIRES_PRO";

const PLAN_LIMIT_MESSAGES: Record<PlanLimitCode, string> = {
  ATHLETE_PLAN_LIMIT_REACHED:
    "O plano Atleta Grátis permite 1 plano próprio. Assine o Atleta Pro para criar planos ilimitados.",
  ATHLETE_WORKOUT_DAY_LIMIT_REACHED:
    "O plano Atleta Grátis permite até 5 treinos por plano próprio. Assine o Atleta Pro para liberar treinos ilimitados.",
  PERIODIZATION_REQUIRES_PRO:
    "Periodizações fazem parte do plano Atleta Pro. Assine para organizar ciclos de treino.",
};

export class PlanLimitError extends ForbiddenError {
  readonly status = 403 as const;

  constructor(code: PlanLimitCode) {
    super(PLAN_LIMIT_MESSAGES[code], code);
    this.name = "PlanLimitError";
  }
}

type DbClient = Prisma.TransactionClient | typeof prisma;

export interface EffectivePlanningLimits {
  planLimit: number | null;
  dayLimit: number | null;
  canUsePeriodizations: boolean;
}

const DEFAULT_ATHLETE_FREE_LIMITS: EffectivePlanningLimits = {
  planLimit: 1,
  dayLimit: 5,
  canUsePeriodizations: false,
};

export function isCoachPrescribedWorkoutPlan(plan: {
  prescribedByProfessionalId?: string | null;
  originType?: string | null;
}): boolean {
  return (
    plan.prescribedByProfessionalId != null ||
    plan.originType === "PROFESSIONAL_HUMAN_AUTHORED" ||
    plan.originType === "PROFESSIONAL_HUMAN_EDITED"
  );
}

export function countTrainingDays(
  workoutDays: ReadonlyArray<{ isRest?: boolean | null }>,
): number {
  return workoutDays.filter((day) => !day.isRest).length;
}

export async function resolveAthleteFallbackFreeEntitlements(
  client: DbClient,
): Promise<Array<{ key: Prisma.PlanEntitlementGetPayload<object>["entitlement"]; limitValue: number | null }>> {
  const freePlan = await client.plan.findUnique({
    where: { code: "ATHLETE_FREE" },
    include: { entitlements: true },
  });

  if (!freePlan || freePlan.entitlements.length === 0) {
    return [
      { key: "ADVANCED_STATS", limitValue: null },
      { key: "WORKOUT_PLAN_LIMIT", limitValue: 1 },
      { key: "WORKOUT_DAY_LIMIT", limitValue: 5 },
    ];
  }

  const mapped = freePlan.entitlements.map((e) => ({
    key: e.entitlement,
    limitValue: e.limitValue,
  }));

  if (!mapped.some((e) => e.key === "WORKOUT_PLAN_LIMIT")) {
    mapped.push({ key: "WORKOUT_PLAN_LIMIT", limitValue: 1 });
  }
  if (!mapped.some((e) => e.key === "WORKOUT_DAY_LIMIT")) {
    mapped.push({ key: "WORKOUT_DAY_LIMIT", limitValue: 5 });
  }
  return mapped;
}

export async function resolveEffectivePlanningLimits(
  client: DbClient,
  userId: string,
  now = new Date(),
): Promise<EffectivePlanningLimits> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      accountType: true,
      subscription: {
        include: { plan: { include: { entitlements: true } } },
      },
    },
  });

  if (!user || user.accountType !== "ATHLETE") {
    return { planLimit: null, dayLimit: null, canUsePeriodizations: true };
  }

  const sub = user.subscription;
  const hasActivePaidPlan =
    sub != null &&
    sub.plan != null &&
    sub.plan.code !== "ATHLETE_FREE" &&
    subscriptionGrantsAccess(sub, now);

  if (hasActivePaidPlan) {
    const planEntry = sub.plan.entitlements.find(
      (e) => e.entitlement === "WORKOUT_PLAN_LIMIT",
    );
    const dayEntry = sub.plan.entitlements.find(
      (e) => e.entitlement === "WORKOUT_DAY_LIMIT",
    );
    const hasPeriodizations = sub.plan.entitlements.some(
      (e) => e.entitlement === "PERIODIZATIONS",
    );
    return {
      planLimit: planEntry ? planEntry.limitValue : null,
      dayLimit: dayEntry ? dayEntry.limitValue : null,
      canUsePeriodizations: hasPeriodizations,
    };
  }

  const freePlan = await client.plan.findUnique({
    where: { code: "ATHLETE_FREE" },
    include: { entitlements: true },
  });

  if (!freePlan) {
    return DEFAULT_ATHLETE_FREE_LIMITS;
  }

  const planEntry = freePlan.entitlements.find(
    (e) => e.entitlement === "WORKOUT_PLAN_LIMIT",
  );
  const dayEntry = freePlan.entitlements.find(
    (e) => e.entitlement === "WORKOUT_DAY_LIMIT",
  );

  return {
    planLimit: planEntry !== undefined ? planEntry.limitValue : 1,
    dayLimit: dayEntry !== undefined ? dayEntry.limitValue : 5,
    canUsePeriodizations: freePlan.entitlements.some(
      (e) => e.entitlement === "PERIODIZATIONS",
    ),
  };
}

export async function countSelfManagedPlans(
  client: DbClient,
  userId: string,
): Promise<number> {
  return client.workoutPlan.count({
    where: {
      userId,
      deletedAt: null,
      prescribedByProfessionalId: null,
      originType: {
        notIn: ["PROFESSIONAL_HUMAN_AUTHORED", "PROFESSIONAL_HUMAN_EDITED"],
      },
    },
  });
}

export async function assertCanCreateSelfWorkoutPlan(
  client: DbClient,
  userId: string,
  trainingDaysCount: number,
  now = new Date(),
): Promise<void> {
  const limits = await resolveEffectivePlanningLimits(client, userId, now);

  if (limits.dayLimit !== null && trainingDaysCount > limits.dayLimit) {
    throw new PlanLimitError("ATHLETE_WORKOUT_DAY_LIMIT_REACHED");
  }

  if (limits.planLimit !== null) {
    const existingSelfPlans = await countSelfManagedPlans(client, userId);
    if (existingSelfPlans >= limits.planLimit) {
      throw new PlanLimitError("ATHLETE_PLAN_LIMIT_REACHED");
    }
  }
}

export async function assertCanEditSelfWorkoutPlanDays(
  client: DbClient,
  userId: string,
  existingPlan: {
    prescribedByProfessionalId?: string | null;
    originType?: string | null;
    workoutDays: ReadonlyArray<{ isRest?: boolean | null }>;
  },
  nextTrainingDaysCount: number,
  now = new Date(),
): Promise<void> {
  if (isCoachPrescribedWorkoutPlan(existingPlan)) {
    return;
  }

  const limits = await resolveEffectivePlanningLimits(client, userId, now);
  if (limits.dayLimit === null) {
    return;
  }

  const currentTrainingDays = countTrainingDays(existingPlan.workoutDays);
  // Existing plans above 5 workouts stay editable as long as they don't grow further.
  if (
    nextTrainingDaysCount > limits.dayLimit &&
    nextTrainingDaysCount > currentTrainingDays
  ) {
    throw new PlanLimitError("ATHLETE_WORKOUT_DAY_LIMIT_REACHED");
  }
}

export async function assertCanUsePeriodizations(
  client: DbClient,
  userId: string,
  now = new Date(),
): Promise<void> {
  const limits = await resolveEffectivePlanningLimits(client, userId, now);
  if (!limits.canUsePeriodizations) {
    throw new PlanLimitError("PERIODIZATION_REQUIRES_PRO");
  }
}
