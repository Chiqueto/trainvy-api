import { describe, expect, it, vi } from "vitest";
import { publishLegalSeed } from "../../src/usecases/PublishLegalSeed.js";
import { contentHash } from "../../src/domain/compliance.js";
import type { Prisma } from "../../src/generated/prisma/client.js";

describe("Contractual publication preserves consent evidence", () => {
  it("archives the previous body, increments the version, and is idempotent", async () => {
    let document = {
      id: "terms",
      slug: "termos-de-uso",
      title: "Old terms",
      contentMd: "Old body",
      version: "1.0.7",
      isActive: true,
    };
    const revisions = new Map<string, unknown>();
    const tx = {
      $queryRaw: vi.fn(async () => []),
      legalDocument: {
        findUnique: vi.fn(async () => ({ ...document })),
        update: vi.fn(
          async ({ data }) => (document = { ...document, ...data }),
        ),
      },
      legalDocumentRevision: {
        upsert: vi.fn(async ({ create }) => {
          if (!revisions.has(create.version))
            revisions.set(create.version, create);
        }),
        create: vi.fn(async ({ data }) => revisions.set(data.version, data)),
      },
    };
    const seed = {
      slug: document.slug,
      title: "New terms",
      contentMd: "Full contractual body",
      version: "1.0.0",
      category: "TERMS_OF_USE",
      targetAudience: "ALL_USERS",
      classification: "OBRIGATORIO_LEI",
    };
    const client = tx as unknown as Prisma.TransactionClient;
    await publishLegalSeed(client, seed);
    expect(document.version).toBe("1.0.8");
    expect(revisions.get("1.0.7")).toMatchObject({
      contentMd: "Old body",
      contentHash: contentHash("Old body"),
    });
    expect(revisions.get("1.0.8")).toMatchObject({
      contentMd: seed.contentMd,
      contentHash: contentHash(seed.contentMd),
    });
    await publishLegalSeed(client, seed);
    expect(document.version).toBe("1.0.8");
    expect(tx.legalDocument.update).toHaveBeenCalledTimes(1);
    expect(revisions.size).toBe(2);
  });
});
