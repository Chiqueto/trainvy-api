import { env } from "./env.js";

export function isConfiguredAdminEmail(email?: string | null): boolean {
  if (!email || !env.ADMIN_EMAILS) return false;
  const list = env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase());
  return list.includes(email.trim().toLowerCase());
}
