import z from "zod";

export const RegistrationBody = z.strictObject({
  fullName: z.string().trim().min(5).max(180),
  cref: z
    .string()
    .trim()
    .regex(
      /^\d{4,8}-[GP]$/i,
      "Informe o registro completo, por exemplo 123456-G",
    ),
  region: z.enum([
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
  ]),
  category: z.string().trim().min(3).max(160),
});
export const ReviewBody = z.strictObject({
  revision: z.number().int().positive(),
  result: z.enum([
    "VERIFIED",
    "REJECTED",
    "SUSPENDED",
    "EXPIRED",
    "PENDING_VERIFICATION",
  ]),
  sourceUrl: z.url().max(500),
  evidence: z.string().trim().min(10).max(1500),
  identityMatched: z.boolean(),
  identityVerificationMethod: z.enum([
    "NOT_CONFIRMED",
    "OFFICIAL_CONTACT",
    "DOCUMENT_REVIEW",
    "LIVE_IDENTITY_CHECK",
  ]),
  identityEvidenceReference: z.string().trim().min(3).max(200),
  registrationActive: z.boolean(),
  scopeConfirmed: z.boolean(),
  checkedAt: z.iso.datetime(),
  publicReason: z.string().trim().min(3).max(400),
});
export const RegistrationResponse = RegistrationBody.extend({
  userId: z.string(),
  status: z.string(),
  revision: z.number(),
  verifiedAt: z.string().nullable(),
  validUntil: z.string().nullable(),
  publicReason: z.string().nullable(),
  updatedAt: z.string(),
});

export const ProfessionalRegistrationSearch = z.strictObject({
  q: z.string().trim().max(180).optional(),
  region: RegistrationBody.shape.region.optional(),
});

export const ProfessionalVerificationPolicyResponse = z.object({
  required: z.boolean(),
  revision: z.number().int(),
  updatedAt: z.string().nullable(),
  updatedByUserId: z.string().nullable(),
});
export const UpdateProfessionalVerificationPolicyBody = z.strictObject({
  required: z.boolean(),
  revision: z.number().int().nonnegative(),
  reason: z.string().trim().min(5).max(500),
});
