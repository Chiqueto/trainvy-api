import { contentHash } from "../domain/compliance.js";
import type { Prisma } from "../generated/prisma/client.js";

type DocumentSeed = Prisma.LegalDocumentCreateInput;

// Called only by the explicitly requested contractual refresh, never normal seed.
export async function publishLegalSeed(
  tx: Prisma.TransactionClient,
  data: DocumentSeed,
) {
  await tx.$queryRaw`SELECT id FROM legal_documents WHERE slug = ${data.slug} FOR UPDATE`;
  const previous = await tx.legalDocument.findUnique({
    where: { slug: data.slug },
  });
  if (previous) {
    await tx.legalDocumentRevision.upsert({
      where: {
        documentId_version: {
          documentId: previous.id,
          version: previous.version,
        },
      },
      create: {
        documentId: previous.id,
        version: previous.version,
        contentMd: previous.contentMd,
        contentHash: contentHash(previous.contentMd),
      },
      update: {},
    });
    if (
      previous.contentMd === data.contentMd &&
      previous.title === data.title &&
      previous.isActive
    )
      return previous;
  }
  const version = previous
    ? previous.version.replace(/(\d+)$/, (patch) => String(Number(patch) + 1))
    : data.version;
  if (previous && version === previous.version)
    throw new Error("Invalid legal version");
  const document = previous
    ? await tx.legalDocument.update({
        where: { id: previous.id },
        data: {
          title: data.title,
          contentMd: data.contentMd,
          version,
          isActive: true,
        },
      })
    : await tx.legalDocument.create({ data });
  await tx.legalDocumentRevision.create({
    data: {
      documentId: document.id,
      version: document.version,
      contentMd: document.contentMd,
      contentHash: contentHash(document.contentMd),
    },
  });
  return document;
}
