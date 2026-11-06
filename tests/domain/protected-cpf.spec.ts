import { describe, expect, it } from "vitest";
import {
  isProtectedCpf,
  maskedStoredCpf,
  protectCpf,
} from "../../src/domain/protected-cpf.js";

describe("CPF storage protection", () => {
  it("stores distinct salted digests of the same CPF and reveals only the display suffix", async () => {
    const first = await protectCpf("529.982.247-25");
    const second = await protectCpf("52998224725");
    expect(first).not.toBe(second);
    expect(isProtectedCpf(first)).toBe(true);
    expect(first).not.toContain("52998224725");
    expect(maskedStoredCpf(first)).toBe("***.***.***-25");
    expect(maskedStoredCpf("52998224725")).toBe("***.***.***-25");
    expect(maskedStoredCpf("unexpected data")).toBe("***.***.***-**");
    expect(maskedStoredCpf(null)).toBeNull();
  });
  it("rejects invalid CPFs without echoing the submitted value", async () => {
    await expect(protectCpf("11111111111")).rejects.toThrow("CPF inválido");
    expect(isProtectedCpf("scrypt:invalid")).toBe(false);
  });
});
