import "dotenv/config";

import { writeFileSync } from "node:fs";

import { prisma } from "../lib/db.js";

const [documents, items] = await Promise.all([
  prisma.legalDocument.findMany({ orderBy: { slug: "asc" } }),
  prisma.legalComplianceItem.findMany({ orderBy: { code: "asc" } }),
]);
const markdown = `# Compliance Jurídico Trainvy — exportação do banco

Exportado em ${new Date().toISOString()}.

## Matriz

${items.map((i) => `### ${i.code} — ${i.title}\n\n${i.classification} · ${i.implementationStatus}\n\nBase: ${i.legalBasis}\n\n${i.descriptionMd}`).join("\n\n")}

## Documentos atuais

${documents.map((d) => `## ${d.title} · v${d.version}\n\nSlug: ${d.slug} · ${d.targetAudience} · ${d.isActive ? "Ativo" : "Inativo"}\n\n${d.contentMd}`).join("\n\n")}
`;
for (const relative of [
  "../../docs/COMPLIANCE_JURIDICO_TRAINVY.md",
  "../../../trainvy-frontend/docs/COMPLIANCE_JURIDICO_TRAINVY.md",
])
  writeFileSync(new URL(relative, import.meta.url), markdown, "utf8");
await prisma.$disconnect();
console.log("Documentação exportada. Nenhum registro do banco foi alterado.");
