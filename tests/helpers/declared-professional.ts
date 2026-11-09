import { createHash } from "node:crypto";
import { prisma } from "../../src/lib/db.js";

// Explicit synthetic declaration/acceptance for integration fixtures. Never a production bypass.
export async function declareTestProfessional(userId: string) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test fixture only");
  const document = await prisma.legalDocument.upsert({
    where: { slug: "declaracao-responsabilidade-cref" },
    update: {},
    create: {
      slug: "declaracao-responsabilidade-cref",
      title: "Declaração CREF — fixture",
      category: "CREF",
      classification: "RECOMENDAVEL_RISCO",
      targetAudience: "COACH",
      version: "1.0.0",
      contentMd: "Declaração fictícia exclusiva de testes",
      requiresClickwrap: true,
    },
  });
  await prisma.professionalRegistration.update({
    where: { userId },
    data: {
      crefVerificationStatus: "DECLARED_ACTIVE",
      crefDeclaredAt: new Date(),
    },
  });
  await prisma.userLegalAcceptance.create({
    data: {
      userId,
      documentId: document.id,
      documentSlug: document.slug,
      documentVersion: document.version,
      contentHash: createHash("sha256")
        .update(document.contentMd)
        .digest("hex"),
      ipAddress: "127.0.0.1",
      userAgent: "Vitest synthetic fixture",
    },
  });
}
