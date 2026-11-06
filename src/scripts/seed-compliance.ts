import "dotenv/config";

import { writeFileSync } from "node:fs";

import { contentHash } from "../domain/compliance.js";
import {
  complianceItems,
  complianceMarkdown,
  legalDocuments,
} from "../domain/legal-content.js";
import { prisma } from "../lib/db.js";

for (const relative of [
  "../../docs/COMPLIANCE_JURIDICO_TRAINVY.md",
  "../../../trainvy-frontend/docs/COMPLIANCE_JURIDICO_TRAINVY.md",
]) {
  writeFileSync(new URL(relative, import.meta.url), complianceMarkdown, "utf8");
}
if (!process.argv.includes("--docs-only")) {
  await prisma.$transaction(async (tx) => {
    for (const data of complianceItems)
      await tx.legalComplianceItem.upsert({
        where: { code: data.code },
        create: data,
        update: {},
      });
    for (const data of [
      ...legalDocuments,
      {
        slug: "matriz-compliance-trainvy",
        title: "Matriz Jurídica Trainvy",
        category: "INTERNAL_COMPLIANCE_GUIDE",
        targetAudience: "ADMIN_ONLY",
        classification: "OBRIGATORIO_LEI",
        version: "1.0.0",
        contentMd: complianceMarkdown,
        requiresClickwrap: false,
        isActive: true,
      },
    ]) {
      const document = await tx.legalDocument.upsert({
        where: { slug: data.slug },
        create: data,
        update: {},
      });
      await tx.legalDocumentRevision.upsert({
        where: {
          documentId_version: {
            documentId: document.id,
            version: document.version,
          },
        },
        create: {
          documentId: document.id,
          version: document.version,
          contentMd: document.contentMd,
          contentHash: contentHash(document.contentMd),
        },
        update: {},
      });
    }
  });
}
await prisma.$disconnect();
console.log(
  "Compliance: documentos gerados; seed insert-only concluído quando solicitado.",
);
