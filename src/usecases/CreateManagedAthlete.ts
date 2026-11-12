import { randomUUID } from "node:crypto";
import {
  assertCoachCanManageAthletes,
  CoachAthleteError,
  getCoachAthleteLimit,
} from "../domain/coach-athlete.js";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { GetCommercialContext } from "./GetCommercialContext.js";

export class CreateManagedAthlete {
  async execute({ coachId, name }: { coachId: string; name: string }) {
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${coachId} FOR UPDATE`;
        const context = await new GetCommercialContext().execute({
          userId: coachId,
          client: tx,
        });
        assertCoachCanManageAthletes(context);
        const limit = getCoachAthleteLimit(context);
        const count = await tx.coachAthlete.count({
          where: { coachId, status: "ACTIVE" },
        });
        if (limit != null && count >= limit)
          throw new CoachAthleteError(
            "ATHLETE_LIMIT_REACHED",
            409,
            "Você atingiu o limite de alunos do seu plano.",
          );
        const id = randomUUID();
        // Never use a real email: OAuth must create a separate account, claimed only by invitation.
        await tx.user.create({
          data: {
            id,
            name,
            email: `${id}@managed.invalid`,
            isManagedProfile: true,
          },
        });
        await tx.coachAthlete.create({ data: { coachId, athleteId: id } });
        return { athleteId: id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
