import { describe, expect, it, vi } from "vitest";
import { protectCpf } from "../../src/domain/protected-cpf.js";
import { PrivacyRights } from "../../src/usecases/PrivacyRights.js";

const state = vi.hoisted(() => ({ cpf: "" }));
vi.mock("../../src/lib/db.js", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: async () => ({
        id: "owner",
        professionalRegistration: { cpf: state.cpf, cref: "123456-G" },
      }),
    },
    applicationAccessLog: { findMany: async () => [] },
  },
}));
describe("CPF in the owner's data export", () => {
  it("does not expose the digest or a legacy plaintext CPF", async () => {
    for (const value of ["52998224725", await protectCpf("52998224725")]) {
      state.cpf = value;
      const exported = await new PrivacyRights().export("owner");
      expect(JSON.parse(exported).user.professionalRegistration.cpf).toBe(
        "***.***.***-25",
      );
      expect(exported).not.toContain(value);
      expect(exported).not.toContain("scrypt:");
    }
  });
});
