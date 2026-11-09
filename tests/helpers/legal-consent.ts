import { createHash } from "node:crypto";
import { prisma } from "../../src/lib/db.js";
export async function acceptTestHealthConsent(userId: string) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test fixture only");
  for (const slug of [
    "termos-de-uso",
    "politica-de-privacidade",
    "termo-saude-parq-lgpd",
  ]) {
    const doc = await prisma.legalDocument.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        title: "Saúde — fixture",
        category: "TEST",
        classification: "TEST",
        targetAudience: "ALL_USERS",
        version: "1.0.0",
        contentMd: "Consentimento fictício exclusivo de testes",
        requiresClickwrap: true,
      },
    });
    await prisma.userLegalAcceptance.create({
      data: {
        userId,
        documentId: doc.id,
        documentSlug: doc.slug,
        documentVersion: doc.version,
        contentHash: createHash("sha256").update(doc.contentMd).digest("hex"),
        ipAddress: "127.0.0.1",
        userAgent: "Vitest synthetic fixture",
      },
    });
  }
}
