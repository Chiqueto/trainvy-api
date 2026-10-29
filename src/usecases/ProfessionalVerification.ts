import z from "zod";

import { CoachAthleteError } from "../domain/coach-athlete.js";
import {
  effectiveProfessionalStatus,
  verificationValidityDays,
} from "../domain/professional-verification.js";
import { prisma } from "../lib/db.js";
import { assertAdminUser } from "../lib/require-admin.js";
import {
  ProfessionalRegistrationSearch,
  RegistrationBody,
  RegistrationResponse,
  ReviewBody,
} from "../schemas/professional-verification.js";

export function registrationDto(r: {
  userId: string;
  fullName: string;
  cref: string;
  region: string;
  category: string;
  status: string;
  revision: number;
  verifiedAt: Date | null;
  validUntil: Date | null;
  publicReason: string | null;
  updatedAt: Date;
}) {
  return RegistrationResponse.parse({
    ...r,
    status: effectiveProfessionalStatus({
      status: r.status,
      validUntil: r.validUntil?.toISOString() ?? null,
    }),
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    validUntil: r.validUntil?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  });
}

export class ProfessionalVerification {
  async get(userId: string) {
    const r = await prisma.professionalRegistration.findUnique({
      where: { userId },
    });
    return r ? registrationDto(r) : null;
  }
  async submit(userId: string, body: z.infer<typeof RegistrationBody>) {
    const data = RegistrationBody.parse(body);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (user?.accountType !== "COACH")
        throw new CoachAthleteError("ONLY_COACHES_ALLOWED", 403);
      const previous = await tx.professionalRegistration.findUnique({
        where: { userId },
      });
      const retainedBlock =
        previous?.status === "SUSPENDED" || previous?.status === "REJECTED"
          ? previous.status
          : null;
      return registrationDto(
        await tx.professionalRegistration.upsert({
          where: { userId },
          create: { userId, ...data, cref: data.cref.toUpperCase() },
          update: {
            ...data,
            cref: data.cref.toUpperCase(),
            status: retainedBlock ?? "PENDING_VERIFICATION",
            revision: { increment: 1 },
            verifiedAt: null,
            validUntil: null,
            publicReason: retainedBlock
              ? "Cadastro atualizado. O bloqueio permanece até revisão administrativa."
              : "Cadastro recebido. Aguarde revisão de titularidade, situação e habilitação.",
          },
        }),
      );
    });
  }
  async list(
    adminId: string,
    query: z.infer<typeof ProfessionalRegistrationSearch> = {},
  ) {
    await assertAdminUser(prisma, adminId);
    const filters = ProfessionalRegistrationSearch.parse(query);
    const fullRegistration = filters.q?.match(/^(\d{4,8}-[GP])\/([A-Z]{2})$/i);
    const search = fullRegistration?.[1] ?? filters.q;
    const region = filters.region ?? fullRegistration?.[2].toUpperCase();
    return (
      await prisma.professionalRegistration.findMany({
        where: {
          ...(region ? { region } : {}),
          ...(search
            ? {
                OR: [
                  { cref: { contains: search, mode: "insensitive" as const } },
                  {
                    fullName: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ updatedAt: "asc" }, { userId: "asc" }],
        take: 100,
      })
    ).map(registrationDto);
  }
  async reviews(adminId: string, userId: string) {
    await assertAdminUser(prisma, adminId);
    return (
      await prisma.professionalVerificationReview.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    ).map((r) => ({
      ...r,
      checkedAt: r.checkedAt.toISOString(),
      validUntil: r.validUntil?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }
  async review(
    adminId: string,
    userId: string,
    body: z.infer<typeof ReviewBody>,
  ) {
    const data = ReviewBody.parse(body);
    return prisma.$transaction(async (tx) => {
      await assertAdminUser(tx, adminId);
      if (adminId === userId)
        throw new CoachAthleteError("SELF_REVIEW_FORBIDDEN", 403);
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
      const r = await tx.professionalRegistration.findUnique({
        where: { userId },
      });
      if (!r) throw new CoachAthleteError("REGISTRATION_NOT_FOUND", 404);
      if (r.revision !== data.revision)
        throw new CoachAthleteError("CONCURRENCY_CONFLICT", 409);
      const now = new Date();
      const checkedAt = new Date(data.checkedAt);
      if (checkedAt > now || now.getTime() - checkedAt.getTime() > 7 * 86400000)
        throw new CoachAthleteError("INVALID_VERIFICATION_DATE", 400);
      // URL is evidence metadata only. No requests/scraping are made by this service.
      const source = new URL(data.sourceUrl);
      const officialHosts = [
        "confef.org.br",
        "www.confef.org.br",
        "cref-sp.implanta.net.br",
        "cref-rj.implanta.net.br",
        "listasconfef.org.br",
        "www.cref6.org.br",
      ];
      const additionalHosts = (
        process.env.PROFESSIONAL_OFFICIAL_SOURCE_HOSTS ?? ""
      )
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);
      if (
        source.protocol !== "https:" ||
        source.username ||
        source.password ||
        source.port ||
        ![...officialHosts, ...additionalHosts].includes(source.hostname)
      )
        throw new CoachAthleteError("OFFICIAL_SOURCE_REQUIRED", 400);
      if (
        data.result === "VERIFIED" &&
        (!data.identityMatched ||
          data.identityVerificationMethod === "NOT_CONFIRMED" ||
          !data.registrationActive ||
          !data.scopeConfirmed)
      )
        throw new CoachAthleteError("VERIFICATION_EVIDENCE_INSUFFICIENT", 400);
      const validUntil =
        data.result === "VERIFIED"
          ? new Date(
              checkedAt.getTime() + verificationValidityDays() * 86400000,
            )
          : null;
      await tx.professionalVerificationReview.create({
        data: {
          userId,
          reviewerId: adminId,
          revision: r.revision,
          registrationSnapshot: {
            fullName: r.fullName,
            cref: r.cref,
            region: r.region,
            category: r.category,
            identityVerificationMethod: data.identityVerificationMethod,
            identityEvidenceReference: data.identityEvidenceReference,
          },
          result: data.result,
          sourceUrl: data.sourceUrl,
          evidence: data.evidence,
          identityMatched: data.identityMatched,
          registrationActive: data.registrationActive,
          scopeConfirmed: data.scopeConfirmed,
          checkedAt,
          validUntil,
        },
      });
      return registrationDto(
        await tx.professionalRegistration.update({
          where: { userId },
          data: {
            status: data.result,
            revision: { increment: 1 },
            verifiedAt: data.result === "VERIFIED" ? checkedAt : null,
            validUntil,
            publicReason: data.publicReason,
          },
        }),
      );
    });
  }
}
