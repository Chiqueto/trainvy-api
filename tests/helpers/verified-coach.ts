import { createTestUser } from "./test-db.js";
import { prisma } from "../../src/lib/db.js";
import { declareTestProfessional } from "./declared-professional.js";

// Synthetic verified identity for regression tests of professional-only draft tools.
export async function createVerifiedTestCoach(
  override?: Parameters<typeof createTestUser>[0],
) {
  const user = await createTestUser(override);
  const coach = await prisma.user.update({
    where: { id: user.id },
    data: {
      accountType: "COACH",
      accountSetupCompletedAt: new Date(),
      professionalRegistration: {
        create: {
          fullName: user.name,
          cref: "123456-G",
          region: "SP",
          category: "Bacharel",
          status: "VERIFIED",
          verifiedAt: new Date(),
          validUntil: new Date("2099-01-01T00:00:00Z"),
        },
      },
    },
  });
  await declareTestProfessional(coach.id);
  return coach;
}
