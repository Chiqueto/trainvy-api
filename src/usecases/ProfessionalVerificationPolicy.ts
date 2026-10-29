import z from "zod";

import { CoachAthleteError } from "../domain/coach-athlete.js";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { assertAdminUser } from "../lib/require-admin.js";
import { UpdateProfessionalVerificationPolicyBody } from "../schemas/professional-verification.js";

export async function readProfessionalVerificationPolicy(
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  // Publication transactions retain this lock until commit. Enabling verification cannot
  // overtake a publication that is already authorized in test mode.
  if (client !== prisma)
    await client.$queryRaw`SELECT id FROM "ProfessionalVerificationPolicy" WHERE id = 'global' FOR SHARE`;
  const row = await client.professionalVerificationPolicy.findUnique({
    where: { id: "global" },
  });
  return {
    required: row?.required ?? true,
    revision: row?.revision ?? 0,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedByUserId: row?.updatedByUserId ?? null,
  };
}

export class ProfessionalVerificationPolicy {
  async get(adminId: string) {
    await assertAdminUser(prisma, adminId);
    return readProfessionalVerificationPolicy();
  }
  async update(
    adminId: string,
    input: z.infer<typeof UpdateProfessionalVerificationPolicyBody>,
  ) {
    const data = UpdateProfessionalVerificationPolicyBody.parse(input);
    return prisma.$transaction(async (tx) => {
      await assertAdminUser(tx, adminId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('trainvy:professional-verification-policy'))`;
      await tx.$queryRaw`SELECT id FROM "ProfessionalVerificationPolicy" WHERE id = 'global' FOR UPDATE`;
      const before = await readProfessionalVerificationPolicy(tx);
      if (before.revision !== data.revision)
        throw new CoachAthleteError(
          "CONCURRENCY_CONFLICT",
          409,
          "A configuração mudou. Atualize a página e tente novamente.",
        );
      if (before.required === data.required) return before;
      await tx.professionalVerificationPolicy.upsert({
        where: { id: "global" },
        create: {
          id: "global",
          required: data.required,
          updatedByUserId: adminId,
        },
        update: {
          required: data.required,
          updatedByUserId: adminId,
          revision: { increment: 1 },
        },
      });
      const after = await readProfessionalVerificationPolicy(tx);
      await tx.adminAuditLog.create({
        data: {
          adminUserId: adminId,
          action: "PROFESSIONAL_VERIFICATION_POLICY_UPDATED",
          entityType: "ProfessionalVerificationPolicy",
          entityId: "global",
          before,
          after,
          metadata: { reason: data.reason },
        },
      });
      return after;
    });
  }
}
