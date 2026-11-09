import { prisma } from "../lib/db.js";
export class CheckReadiness {
  async execute() {
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1`;
      },
      { timeout: 3000, maxWait: 3000 },
    );
    return { status: "ok" as const };
  }
}
