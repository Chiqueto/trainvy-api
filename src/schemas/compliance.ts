import z from "zod";

import {
  crefStatuses,
  legalClassifications,
  validCpf,
} from "../domain/compliance.js";
import { RegistrationBody } from "./professional-verification.js";

export const DocumentSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  category: z.string(),
  classification: z.enum(legalClassifications),
  targetAudience: z.string(),
  version: z.string(),
  contentMd: z.string(),
  requiresClickwrap: z.boolean(),
  isActive: z.boolean(),
  updatedAt: z.string(),
  contentHash: z.string(),
  accepted: z.boolean().optional(),
});
export const AcceptanceBody = z.strictObject({
  version: z.string().max(50),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  accepted: z.literal(true),
});
export const DeclarationBody = RegistrationBody.extend({
  cref: z.string().regex(/^\d{6}-[GP]$/),
  cpf: z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .refine(validCpf, "CPF inválido"),
  acceptance: AcceptanceBody,
});
export const EditDocumentBody = z.strictObject({
  expectedVersion: z.string().max(50),
  contentMd: z.string().trim().min(20).max(200000),
  title: z.string().trim().min(3).max(200),
});
export const ItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  module: z.string(),
  title: z.string(),
  classification: z.enum(legalClassifications),
  legalBasis: z.string(),
  descriptionMd: z.string(),
  implementationStatus: z.enum(["IMPLEMENTED", "PARTIAL", "PENDING"]),
});
export const ReviewExerciseBody = z.strictObject({
  professionalName: z.string().trim().min(5).max(180),
  cref: z
    .string()
    .regex(/^\d{6}-[GP]\/[A-Z]{2}$/)
    .refine(
      (value) =>
        RegistrationBody.shape.region.safeParse(value.split("/")[1]).success,
      "UF inválida",
    ),
  status: z.enum(["PENDING_REVIEW", "REVIEWED_APPROVED"]),
  safetyDisclaimerMd: z.string().trim().max(4000),
});
export const ProfessionalAuditSchema = z.object({
  userId: z.string(),
  fullName: z.string(),
  cpf: z.string().nullable(),
  cref: z.string(),
  region: z.string(),
  crefVerificationStatus: z.enum(crefStatuses),
  crefDeclaredAt: z.string().nullable(),
  verifiedAt: z.string().nullable(),
});
export const ExerciseReviewSchema = z.object({
  id: z.string(),
  name: z.string(),
  biomechanicalReviewStatus: z.string(),
  reviewedByProfessionalName: z.string().nullable(),
  reviewedByCref: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  safetyDisclaimerMd: z.string().nullable(),
});
export const AcceptanceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  documentSlug: z.string(),
  documentVersion: z.string(),
  contentHash: z.string(),
  acceptedAt: z.string(),
  revokedAt: z.string().nullable(),
  ipAddress: z.string(),
  userAgent: z.string().nullable(),
});
export const ComplianceOverviewSchema = z.object({
  documents: z.array(DocumentSchema),
  items: z.array(ItemSchema),
  professionals: z.array(ProfessionalAuditSchema),
  exercises: z.array(ExerciseReviewSchema),
  acceptances: z.array(AcceptanceSchema),
});
