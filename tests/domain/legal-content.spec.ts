import { afterEach, describe, expect, it, vi } from "vitest";
import { contentHash } from "../../src/domain/compliance.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("Supplied contractual content and configurable identity", () => {
  it("preserves every supplied paragraph exactly with the default identity", async () => {
    vi.stubEnv("LEGAL_ENTITY_NAME", "");
    vi.stubEnv("LEGAL_CONTACT_EMAIL", "");
    vi.resetModules();
    const { legalDocuments } =
      await import("../../src/domain/legal-content.js");
    const expected = {
      "termos-de-uso":
        "ab00c62047985c6caee27663f056379bfbc9201dd46c6d2b447e86f09e27c79c",
      "politica-de-privacidade":
        "22a7b8f942363bda569f78d6985baced067bbd601c2b50a4536c36d849f5bc4a",
      "termo-saude-parq-lgpd":
        "98d81a8415c0c5c3e10ce907a0223a142e29a04b3f13b49628b4375e727c96fa",
      "diretrizes-ia-seguranca":
        "009194133d4dd8738086844bdef18b22b5a2dd44a3210ee4cc18a083c133c83c",
    };
    for (const [slug, hash] of Object.entries(expected)) {
      expect(
        contentHash(legalDocuments.find((d) => d.slug === slug)!.contentMd),
      ).toBe(hash);
    }
  });
  it("uses the configured legal entity and email in all contractual occurrences", async () => {
    vi.stubEnv("LEGAL_ENTITY_NAME", "Empresa Exemplo Ltda. (CNPJ fictício)");
    vi.stubEnv("LEGAL_CONTACT_EMAIL", "privacidade@example.invalid");
    vi.resetModules();
    const { legalDocuments } =
      await import("../../src/domain/legal-content.js");
    const terms = legalDocuments.find((d) => d.slug === "termos-de-uso")!;
    const privacy = legalDocuments.find(
      (d) => d.slug === "politica-de-privacidade",
    )!;
    for (const document of [terms, privacy]) {
      expect(document.contentMd).toContain(
        "Empresa Exemplo Ltda. (CNPJ fictício)",
      );
      expect(document.contentMd).toContain("privacidade@example.invalid");
      expect(document.contentMd).not.toContain("lfchiqueto@gmail.com");
    }
  });
});
