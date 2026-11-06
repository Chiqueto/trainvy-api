import { randomBytes, scrypt } from "node:crypto";
import { validCpf } from "./compliance.js";

const prefix = "scrypt:v1:32768:8:3";
const protectedPattern =
  /^scrypt:v1:32768:8:3:[a-f0-9]{32}:[a-f0-9]{64}:\d{2}$/;

export function isProtectedCpf(value: string) {
  return protectedPattern.test(value);
}

// The application does not need to recover the full CPF. Keep only a salted,
// costly digest and its display suffix, without an encryption key to manage.
export async function protectCpf(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!validCpf(digits)) throw new Error("CPF inválido");
  const salt = randomBytes(16).toString("hex");
  const digest = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      digits,
      salt,
      32,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(new Error("Falha ao proteger o CPF"));
        else resolve(key);
      },
    );
  });
  return `${prefix}:${salt}:${digest.toString("hex")}:${digits.slice(-2)}`;
}

export function maskedStoredCpf(value: string | null | undefined) {
  if (!value) return null;
  if (isProtectedCpf(value)) return `***.***.***-${value.slice(-2)}`;
  // Compatibility while legacy plaintext records are being migrated.
  if (validCpf(value))
    return `***.***.***-${value.replace(/\D/g, "").slice(-2)}`;
  return "***.***.***-**";
}
