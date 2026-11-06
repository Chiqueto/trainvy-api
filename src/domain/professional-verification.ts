import { CoachAthleteError } from "./coach-athlete.js";

export interface ProfessionalAccess {
  status: string;
  crefVerificationStatus?: string;
  validUntil: string | null;
}

export function effectiveProfessionalStatus(
  registration: ProfessionalAccess | null | undefined,
  now = new Date(),
) {
  if (!registration) return "PENDING_VERIFICATION";
  if (
    registration.status === "VERIFIED" &&
    (!registration.validUntil ||
      !Number.isFinite(new Date(registration.validUntil).getTime()) ||
      new Date(registration.validUntil).getTime() <= now.getTime())
  )
    return "EXPIRED";
  return registration.status;
}

export function assertProfessionalVerified(
  registration: ProfessionalAccess | null | undefined,
) {
  if (effectiveProfessionalStatus(registration) !== "VERIFIED") {
    throw new CoachAthleteError(
      "PROFESSIONAL_VERIFICATION_REQUIRED",
      403,
      "Seu CREF e sua habilitação precisam de verificação vigente para usar recursos profissionais.",
    );
  }
}

export function hasProfessionalAccess(
  registration: ProfessionalAccess | null | undefined,
  _verificationRequired = true,
) {
  const status = effectiveProfessionalStatus(registration);
  if (["SUSPENDED", "REJECTED"].includes(status) || registration?.crefVerificationStatus === "SUSPENDED_FRAUD") return false;
  if (["DECLARED_ACTIVE", "VERIFIED_ADMIN"].includes(registration?.crefVerificationStatus ?? "")) return true;
  return false;
}

export function assertProfessionalAccess(
  registration: ProfessionalAccess | null | undefined,
  verificationRequired = true,
) {
  if (!hasProfessionalAccess(registration, verificationRequired))
    throw new CoachAthleteError("PROFESSIONAL_VERIFICATION_REQUIRED", 403, "Declare CPF, CREF/UF e aceite o termo profissional para prescrever. Suspensões exigem revisão administrativa.");
}

export function verificationValidityDays() {
  const days = Number(
    process.env.PROFESSIONAL_VERIFICATION_VALIDITY_DAYS ?? 180,
  );
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new Error("Invalid PROFESSIONAL_VERIFICATION_VALIDITY_DAYS");
  return days;
}
