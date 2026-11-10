import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { assertAdminUser } from "../lib/require-admin.js";

export class AiDisabledError extends Error {
  readonly code = "AI_DISABLED";
  readonly statusCode = 503;
  constructor() {
    super("Os recursos de IA estão desativados para este perfil.");
  }
}
export class AiPolicyConflictError extends Error {
  readonly code = "CONCURRENCY_CONFLICT";
  readonly statusCode = 409;
  constructor() {
    super("A configuração mudou. Atualize a página e tente novamente.");
  }
}
export async function readAiAvailability(
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const row = await client.aiAvailability.findUnique({
    where: { id: "global" },
  });
  return {
    professionalAiEnabled: row?.professionalAiEnabled ?? false,
    athleteAiEnabled: row?.athleteAiEnabled ?? false,
    revision: row?.revision ?? 0,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}
export async function assertAiEnabledForUser(userId?: string) {
  if (!userId) throw new AiDisabledError();
  try {
    const [policy, user] = await Promise.all([
      readAiAvailability(),
      prisma.user.findUnique({
        where: { id: userId },
        select: { accountType: true, deletedAt: true },
      }),
    ]);
    if (
      !user ||
      user.deletedAt ||
      !(user.accountType === "COACH"
        ? policy.professionalAiEnabled
        : user.accountType === "ATHLETE"
          ? policy.athleteAiEnabled
          : false)
    )
      throw new AiDisabledError();
  } catch {
    throw new AiDisabledError();
  }
}
export class AiAvailability {
  async public() {
    try {
      const { professionalAiEnabled, athleteAiEnabled } =
        await readAiAvailability();
      return { professionalAiEnabled, athleteAiEnabled };
    } catch {
      return { professionalAiEnabled: false, athleteAiEnabled: false };
    }
  }
  async get(adminId: string) {
    await assertAdminUser(prisma, adminId);
    return readAiAvailability();
  }
  async update(
    adminId: string,
    input: {
      professionalAiEnabled: boolean;
      athleteAiEnabled: boolean;
      revision: number;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      await assertAdminUser(tx, adminId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('trainvy:ai-availability'))`;
      const before = await readAiAvailability(tx);
      if (before.revision !== input.revision) throw new AiPolicyConflictError();
      await tx.aiAvailability.upsert({
        where: { id: "global" },
        create: {
          id: "global",
          ...input,
          revision: before.revision + 1,
          updatedByUserId: adminId,
        },
        update: {
          professionalAiEnabled: input.professionalAiEnabled,
          athleteAiEnabled: input.athleteAiEnabled,
          revision: { increment: 1 },
          updatedByUserId: adminId,
        },
      });
      const after = await readAiAvailability(tx);
      await tx.adminAuditLog.create({
        data: {
          adminUserId: adminId,
          action: "AI_AVAILABILITY_UPDATED",
          entityType: "AiAvailability",
          entityId: "global",
          before,
          after,
        },
      });
      return after;
    });
  }
}

export async function assertAiPlanSignupAvailable(
  planId: string,
  accountType: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (accountType !== "COACH") return;
  const includesAi = await client.planEntitlement.count({
    where: { planId, entitlement: { in: ["AI_CHAT", "AI_PLAN_GENERATION"] } },
  });
  if (includesAi && !(await readAiAvailability(client)).professionalAiEnabled)
    throw new AiDisabledError();
}
