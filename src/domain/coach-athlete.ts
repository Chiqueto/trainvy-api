import crypto from "node:crypto";
import { getEntitlementLimit, hasEntitlement } from "./commercial.js";

export class CoachAthleteError extends Error {
  constructor(
    public code: string,
    public status: 400 | 401 | 403 | 404 | 409 = 400,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CoachAthleteError";
  }
}

export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashInvitationToken(token);
  return { token, tokenHash };
}

export function hashInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface CoachCommercialContext {
  accountType: string;
  accountSetupCompletedAt: string | null;
  entitlements: { key: string; limitValue: number | null }[];
}

export function assertCoachCanManageAthletes(context: CoachCommercialContext): void {
  if (context.accountType !== "COACH") {
    throw new CoachAthleteError(
      "ONLY_COACHES_ALLOWED",
      403,
      "Apenas contas do tipo treinador (COACH) podem gerenciar alunos.",
    );
  }

  if (!context.accountSetupCompletedAt) {
    throw new CoachAthleteError(
      "ACCOUNT_SETUP_REQUIRED",
      403,
      "Conclua a configuração inicial da sua conta antes de gerenciar alunos.",
    );
  }

  // @ts-expect-error key type conversion
  if (!hasEntitlement(context, "MANAGE_ATHLETES")) {
    throw new CoachAthleteError(
      "MANAGE_ATHLETES_ENTITLEMENT_REQUIRED",
      403,
      "Seu plano atual não possui permissão ativa para gerenciar alunos (MANAGE_ATHLETES).",
    );
  }
}

export function getCoachAthleteLimit(context: CoachCommercialContext): number | null | undefined {
  // @ts-expect-error key type conversion
  return getEntitlementLimit(context, "MANAGE_ATHLETES");
}
