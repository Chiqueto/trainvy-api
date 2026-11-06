import z from "zod";

import { ageFromBirthDate, birthDateString } from "../domain/birth-date.js";
import { CoachAthleteError } from "../domain/coach-athlete.js";
import { contentHash } from "../domain/compliance.js";
import { assertProfessionalAccess } from "../domain/professional-verification.js";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { assertAdminUser } from "../lib/require-admin.js";
import { PrescriptionPayloadSchema } from "../schemas/coach-prescription.js";
import {
  AcceptanceBody,
  ComplianceOverviewSchema,
  DeclarationBody,
  DocumentSchema,
  EditDocumentBody,
  ReviewExerciseBody,
} from "../schemas/compliance.js";

type Db = Prisma.TransactionClient;
type Evidence = { ipAddress: string; userAgent?: string };
export async function recordLegalAcceptance(
  tx: Db,
  userId: string,
  slug: string,
  body: z.infer<typeof AcceptanceBody>,
  evidence: Evidence,
  metadataJson: Prisma.InputJsonValue = {},
) {
  AcceptanceBody.parse(body);
  const document = await tx.legalDocument.findUnique({ where: { slug } });
  if (
    !document?.isActive ||
    document.targetAudience === "ADMIN_ONLY" ||
    !document.requiresClickwrap
  )
    throw new CoachAthleteError("DOCUMENT_NOT_FOUND", 404);
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.deletedAt) throw new CoachAthleteError("UNAUTHORIZED", 401);
  if (
    document.targetAudience === "PROFESSIONAL" &&
    user.accountType !== "COACH"
  )
    throw new CoachAthleteError("ONLY_COACHES_ALLOWED", 403);
  if (
    document.version !== body.version ||
    contentHash(document.contentMd) !== body.contentHash
  )
    throw new CoachAthleteError(
      "DOCUMENT_VERSION_CHANGED",
      409,
      "O documento mudou. Leia a versão atual antes de aceitar.",
    );
  const previous = await tx.userLegalAcceptance.findFirst({
    where: {
      userId,
      documentId: document.id,
      documentVersion: document.version,
      revokedAt: null,
    },
    orderBy: { acceptedAt: "desc" },
  });
  if (
    previous &&
    JSON.stringify(previous.metadataJson) === JSON.stringify(metadataJson)
  )
    return previous;
  return tx.userLegalAcceptance.create({
    data: {
      userId,
      documentId: document.id,
      documentSlug: slug,
      documentVersion: document.version,
      contentHash: body.contentHash,
      ...evidence,
      metadataJson,
    },
  });
}
export async function assertHealthConsent(userId: string, client: Db = prisma) {
  const document = await client.legalDocument.findUnique({
    where: { slug: "termo-saude-parq-lgpd" },
  });
  if (!document?.isActive)
    throw new CoachAthleteError(
      "HEALTH_CONSENT_REQUIRED",
      403,
      "Leia e aceite o termo de saúde e dados no seu perfil.",
    );
  const acceptance = await client.userLegalAcceptance.findFirst({
    where: {
      userId,
      documentId: document.id,
      documentVersion: document.version,
      revokedAt: null,
    },
  });
  if (!acceptance || acceptance.revokedAt)
    throw new CoachAthleteError(
      "HEALTH_CONSENT_REQUIRED",
      403,
      "Autorize o tratamento de dados de saúde no seu perfil.",
    );
}
export async function assertAutonomousAdult(
  userId: string,
  client: Db = prisma,
) {
  const user = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: { accountType: true, birthDate: true, deletedAt: true },
  });
  if (user.deletedAt) throw new CoachAthleteError("UNAUTHORIZED", 401);
  const birthDate = birthDateString(user.birthDate);
  if (
    user.accountType === "ATHLETE" &&
    (!birthDate || ageFromBirthDate(birthDate) < 18)
  )
    throw new CoachAthleteError(
      "ADULT_ACCOUNT_REQUIRED",
      403,
      "Confirme no perfil uma data de nascimento correspondente a pelo menos 18 anos para usar uma conta autônoma.",
    );
}
export async function assertCoreLegalAcceptances(
  userId: string,
  client: Db = prisma,
) {
  const documents = await client.legalDocument.findMany({
    where: {
      slug: { in: ["termos-de-uso", "politica-de-privacidade"] },
      isActive: true,
    },
  });
  if (documents.length !== 2)
    throw new CoachAthleteError("LEGAL_ACCEPTANCE_REQUIRED", 403);
  for (const d of documents) {
    if (
      !(await client.userLegalAcceptance.findFirst({
        where: {
          userId,
          documentId: d.id,
          documentVersion: d.version,
          revokedAt: null,
        },
      }))
    )
      throw new CoachAthleteError(
        "LEGAL_ACCEPTANCE_REQUIRED",
        403,
        "Leia e aceite a versão atual dos termos e da política de privacidade.",
      );
  }
}
export class LegalCompliance {
  async archivedPrescriptions(coachId: string) {
    const rows = await prisma.workoutPrescription.findMany({
      where: {
        coachId,
        approvedAt: { not: null },
        athlete: {
          coachAthletesAsAthlete: { none: { coachId, status: "ACTIVE" } },
        },
      },
      orderBy: { approvedAt: "desc" },
      take: 100,
      select: {
        id: true,
        athleteId: true,
        name: true,
        notes: true,
        approvedAt: true,
        prescribedCrefSnapshot: true,
        payload: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      payload: PrescriptionPayloadSchema.parse(r.payload),
      approvedAt: r.approvedAt!.toISOString(),
    }));
  }
  async approvePlan(userId: string, id: string, expectedUpdatedAt: string) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { professionalRegistration: true },
      });
      if (user.accountType !== "COACH")
        throw new CoachAthleteError("ONLY_COACHES_ALLOWED", 403);
      const r = user.professionalRegistration;
      assertProfessionalAccess(
        r ? { ...r, validUntil: r.validUntil?.toISOString() ?? null } : null,
      );
      await tx.$queryRaw`SELECT id FROM "WorkoutPlan" WHERE id = ${id} FOR UPDATE`;
      const plan = await tx.workoutPlan.findFirst({
        where: { id, userId, deletedAt: null },
      });
      if (!plan) throw new CoachAthleteError("PLAN_NOT_FOUND", 404);
      if (
        plan.updatedAt.toISOString() !== expectedUpdatedAt ||
        plan.prescriptionStatus !== "DRAFT_AI"
      )
        throw new CoachAthleteError(
          "CONCURRENCY_CONFLICT",
          409,
          "O plano mudou. Revise a versão atual antes de aprovar.",
        );
      await tx.workoutPlan.update({
        where: { id },
        data: {
          prescriptionStatus: "APPROVED_PRESCRIBED",
          prescribedByProfessionalId: userId,
          prescribedCrefSnapshot: `${r!.fullName} — CREF ${r!.cref}/${r!.region}`,
          humanApprovedAt: new Date(),
        },
      });
    });
    return { success: true as const };
  }
  async documents(userId?: string, admin = false) {
    if (admin) await assertAdminUser(prisma, userId!);
    const documents = await prisma.legalDocument.findMany({
      where: admin
        ? {}
        : { isActive: true, targetAudience: { not: "ADMIN_ONLY" } },
      orderBy: { slug: "asc" },
    });
    const acceptances = userId
      ? await prisma.userLegalAcceptance.findMany({
          where: { userId, revokedAt: null },
        })
      : [];
    return documents.map((d) =>
      DocumentSchema.parse({
        ...d,
        updatedAt: d.updatedAt.toISOString(),
        contentHash: contentHash(d.contentMd),
        accepted: acceptances.some(
          (a) => a.documentId === d.id && a.documentVersion === d.version,
        ),
      }),
    );
  }
  async accept(
    userId: string,
    slug: string,
    body: z.infer<typeof AcceptanceBody>,
    evidence: Evidence,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM legal_documents WHERE slug = ${slug} FOR SHARE`;
      const existing = await recordLegalAcceptance(
        tx,
        userId,
        slug,
        body,
        evidence,
      );
      if (existing.revokedAt)
        throw new CoachAthleteError(
          "CONSENT_REVOKED",
          409,
          "Solicite nova autorização de consentimento no perfil.",
        );
    });
    return { success: true as const };
  }
  async declare(
    userId: string,
    raw: z.infer<typeof DeclarationBody>,
    evidence: Evidence,
  ) {
    const data = DeclarationBody.parse(raw);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.accountType !== "COACH")
        throw new CoachAthleteError("ONLY_COACHES_ALLOWED", 403);
      const previous = await tx.professionalRegistration.findUnique({
        where: { userId },
      });
      if (
        previous?.crefVerificationStatus === "SUSPENDED_FRAUD" ||
        ["SUSPENDED", "REJECTED"].includes(previous?.status ?? "")
      )
        throw new CoachAthleteError(
          "PROFESSIONAL_SUSPENDED",
          403,
          "O bloqueio exige revisão administrativa.",
        );
      await tx.$queryRaw`SELECT id FROM legal_documents WHERE slug = 'declaracao-responsabilidade-cref' FOR SHARE`;
      await recordLegalAcceptance(
        tx,
        userId,
        "declaracao-responsabilidade-cref",
        data.acceptance,
        evidence,
        { cref_informed: `${data.cref}/${data.region}`, cpf_informed: "***" },
      );
      const registration = {
        fullName: data.fullName,
        cpf: data.cpf,
        cref: data.cref,
        region: data.region,
        category: data.category,
        crefVerificationStatus: "DECLARED_ACTIVE",
        crefDeclaredAt: new Date(),
        status: "PENDING_VERIFICATION" as const,
        verifiedAt: null,
        validUntil: null,
      };
      await tx.professionalRegistration.upsert({
        where: { userId },
        create: { userId, ...registration },
        update: { ...registration, revision: { increment: 1 } },
      });
      return { success: true as const };
    });
  }
  async overview(adminId: string, q?: string, cursor?: string) {
    await assertAdminUser(prisma, adminId);
    const [documents, items, professionals, exercises, acceptances] =
      await Promise.all([
        this.documents(adminId, true),
        prisma.legalComplianceItem.findMany({ orderBy: { code: "asc" } }),
        prisma.professionalRegistration.findMany({
          take: 50,
          where: q
            ? {
                OR: [
                  { fullName: { contains: q, mode: "insensitive" } },
                  { cref: { contains: q } },
                  { userId: q },
                ],
              }
            : {},
          orderBy: { userId: "asc" },
        }),
        prisma.exercise.findMany({
          take: 50,
          where: {
            ownerUserId: null,
            ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
          },
          orderBy: { name: "asc" },
        }),
        prisma.userLegalAcceptance.findMany({
          take: 50,
          where: q
            ? {
                OR: [
                  { userId: q },
                  { user: { email: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {},
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
        }),
      ]);
    return ComplianceOverviewSchema.parse({
      documents,
      items,
      professionals: professionals.map((p) => ({
        ...p,
        cpf: p.cpf ? `***.***.***-${p.cpf.slice(-2)}` : null,
        crefDeclaredAt: p.crefDeclaredAt?.toISOString() ?? null,
        verifiedAt: p.verifiedAt?.toISOString() ?? null,
      })),
      exercises: exercises.map((e) => ({
        ...e,
        reviewedAt: e.reviewedAt?.toISOString() ?? null,
      })),
      acceptances: acceptances.map((a) => ({
        ...a,
        acceptedAt: a.acceptedAt.toISOString(),
        revokedAt: a.revokedAt?.toISOString() ?? null,
      })),
    });
  }
  async editDocument(
    adminId: string,
    id: string,
    raw: z.infer<typeof EditDocumentBody>,
  ) {
    const data = EditDocumentBody.parse(raw);
    await prisma.$transaction(async (tx) => {
      await assertAdminUser(tx, adminId);
      await tx.$queryRaw`SELECT id FROM legal_documents WHERE id = ${id} FOR UPDATE`;
      const d = await tx.legalDocument.findUnique({ where: { id } });
      if (!d) throw new CoachAthleteError("DOCUMENT_NOT_FOUND", 404);
      if (d.version !== data.expectedVersion)
        throw new CoachAthleteError("DOCUMENT_VERSION_CHANGED", 409);
      const parts = d.version.split(".").map(Number);
      const version = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
      await tx.legalDocumentRevision.create({
        data: {
          documentId: id,
          version,
          contentMd: data.contentMd,
          contentHash: contentHash(data.contentMd),
          createdByUserId: adminId,
        },
      });
      await tx.legalDocument.update({
        where: { id },
        data: { contentMd: data.contentMd, title: data.title, version },
      });
      await tx.adminAuditLog.create({
        data: {
          adminUserId: adminId,
          action: "COMPLIANCE_UPDATED",
          entityType: "LegalDocument",
          entityId: id,
          before: { version: d.version },
          after: { version, contentHash: contentHash(data.contentMd) },
        },
      });
    });
    return { success: true as const };
  }
  async updateItem(
    adminId: string,
    id: string,
    implementationStatus: "IMPLEMENTED" | "PARTIAL" | "PENDING",
  ) {
    await prisma.$transaction(async (tx) => {
      await assertAdminUser(tx, adminId);
      await tx.legalComplianceItem.update({
        where: { id },
        data: { implementationStatus },
      });
      await tx.adminAuditLog.create({
        data: {
          adminUserId: adminId,
          action: "COMPLIANCE_UPDATED",
          entityType: "LegalComplianceItem",
          entityId: id,
          after: { implementationStatus },
        },
      });
    });
    return { success: true as const };
  }
  async professional(
    adminId: string,
    userId: string,
    status: "VERIFIED_ADMIN" | "SUSPENDED_FRAUD",
  ) {
    await prisma.$transaction(async (tx) => {
      await assertAdminUser(tx, adminId);
      if (userId === adminId)
        throw new CoachAthleteError("SELF_REVIEW_FORBIDDEN", 403);
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
      const r = await tx.professionalRegistration.findUnique({
        where: { userId },
      });
      if (!r?.cpf || !r.crefDeclaredAt)
        throw new CoachAthleteError("DECLARATION_REQUIRED", 409);
      await tx.professionalRegistration.update({
        where: { userId },
        data: {
          crefVerificationStatus: status,
          status: status === "VERIFIED_ADMIN" ? "VERIFIED" : "SUSPENDED",
          verifiedAt: status === "VERIFIED_ADMIN" ? new Date() : null,
          validUntil:
            status === "VERIFIED_ADMIN"
              ? new Date(Date.now() + 180 * 86400000)
              : null,
          revision: { increment: 1 },
        },
      });
      await tx.adminAuditLog.create({
        data: {
          adminUserId: adminId,
          targetUserId: userId,
          action: "COMPLIANCE_UPDATED",
          entityType: "ProfessionalRegistration",
          entityId: userId,
          metadata: { status, cref: `${r.cref}/${r.region}` },
        },
      });
    });
    return { success: true as const };
  }
  async reviewExercise(
    adminId: string,
    id: string,
    raw: z.infer<typeof ReviewExerciseBody>,
  ) {
    const data = ReviewExerciseBody.parse(raw);
    await prisma.$transaction(async (tx) => {
      await assertAdminUser(tx, adminId);
      const e = await tx.exercise.findFirst({
        where: { id, ownerUserId: null },
      });
      if (!e) throw new CoachAthleteError("EXERCISE_NOT_FOUND", 404);
      await tx.biomechanicalReview.create({
        data: { exerciseId: id, reviewerId: adminId, ...data },
      });
      await tx.exercise.update({
        where: { id },
        data: {
          biomechanicalReviewStatus: data.status,
          reviewedByProfessionalName: data.professionalName,
          reviewedByCref: data.cref,
          reviewedAt: data.status === "REVIEWED_APPROVED" ? new Date() : null,
          safetyDisclaimerMd: data.safetyDisclaimerMd,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          adminUserId: adminId,
          action: "COMPLIANCE_UPDATED",
          entityType: "Exercise",
          entityId: id,
          after: data,
        },
      });
    });
    return { success: true as const };
  }
}
