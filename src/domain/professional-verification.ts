import { CoachAthleteError } from "./coach-athlete.js";

export interface ProfessionalAccess {
  status: string;
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
  verificationRequired = true,
) {
  const status = effectiveProfessionalStatus(registration);
  return (
    status === "VERIFIED" ||
    (verificationRequired === false &&
      ["PENDING_VERIFICATION", "EXPIRED"].includes(status))
  );
}

export function assertProfessionalAccess(
  registration: ProfessionalAccess | null | undefined,
  verificationRequired = true,
) {
  if (!hasProfessionalAccess(registration, verificationRequired))
    assertProfessionalVerified(registration);
}

export function verificationValidityDays() {
  const days = Number(
    process.env.PROFESSIONAL_VERIFICATION_VALIDITY_DAYS ?? 180,
  );
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new Error("Invalid PROFESSIONAL_VERIFICATION_VALIDITY_DAYS");
  return days;
}
