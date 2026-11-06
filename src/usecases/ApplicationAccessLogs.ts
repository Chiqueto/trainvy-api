import { prisma } from "../lib/db.js";
export function accessLogExpiry(accessedAt: Date) {
  const expiry = new Date(accessedAt);
  const day = expiry.getUTCDate();
  expiry.setUTCDate(1);
  expiry.setUTCMonth(expiry.getUTCMonth() + 6);
  const lastDay = new Date(
    Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth() + 1, 0),
  ).getUTCDate();
  expiry.setUTCDate(Math.min(day, lastDay));
  return expiry;
}
export class ApplicationAccessLogs {
  async record(userId: string, ipAddress: string) {
    const accessedAt = new Date();
    const expiresAt = accessLogExpiry(accessedAt);
    await prisma.applicationAccessLog.create({
      data: { userId, ipAddress, accessedAt, expiresAt },
    });
  }
  async purgeExpired() {
    return prisma.applicationAccessLog.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
  }
}
