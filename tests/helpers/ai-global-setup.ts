import { prisma } from "../../src/lib/db.js";

// Existing AI regression suites explicitly exercise the enabled configuration.
// Production defaults remain false. Restore the isolated test database afterward.
export default async function setup() {
  if (process.env.NODE_ENV !== "test") throw new Error("Test fixture only");
  const before = await prisma.aiAvailability.findUnique({
    where: { id: "global" },
  });
  await prisma.aiAvailability.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      professionalAiEnabled: true,
      athleteAiEnabled: true,
    },
    update: { professionalAiEnabled: true, athleteAiEnabled: true },
  });
  return async () => {
    if (before)
      await prisma.aiAvailability.upsert({
        where: { id: "global" },
        create: before,
        update: before,
      });
    else await prisma.aiAvailability.deleteMany({ where: { id: "global" } });
    await prisma.$disconnect();
  };
}
