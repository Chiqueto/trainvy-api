import {
  type FeatureKey,
  FeatureTermsError,
  getFeatureTerms,
} from "../domain/feature-terms.js";
import { prisma } from "../lib/db.js";

export class FeatureTerms {
  async status(userId: string, feature: FeatureKey) {
    const terms = getFeatureTerms(feature);
    const acceptance = await prisma.featureTermsAcceptance.findUnique({
      where: {
        userId_feature_version_textHash: {
          userId,
          feature,
          version: terms.version,
          textHash: terms.textHash,
        },
      },
    });
    return {
      ...terms,
      accepted: !!acceptance,
      acceptanceId: acceptance?.id ?? null,
      acceptedAt: acceptance?.acceptedAt.toISOString() ?? null,
    };
  }

  async accept(input: {
    userId: string;
    feature: FeatureKey;
    version: string;
    textHash: string;
    ipAddress: string;
    userAgent?: string;
  }) {
    const terms = getFeatureTerms(input.feature);
    if (input.version !== terms.version || input.textHash !== terms.textHash)
      throw new FeatureTermsError("FEATURE_TERMS_CHANGED", 409);
    // Idempotent: retries never overwrite the original server timestamp or evidence.
    await prisma.featureTermsAcceptance.upsert({
      where: {
        userId_feature_version_textHash: {
          userId: input.userId,
          feature: input.feature,
          version: terms.version,
          textHash: terms.textHash,
        },
      },
      create: {
        userId: input.userId,
        feature: input.feature,
        version: terms.version,
        textHash: terms.textHash,
        title: terms.title,
        text: terms.text,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent?.slice(0, 1024) ?? null,
      },
      update: {},
    });
    return this.status(input.userId, input.feature);
  }

  async authorize(userId: string, feature: FeatureKey, context: string) {
    const status = await this.status(userId, feature);
    if (!status.acceptanceId)
      throw new FeatureTermsError("FEATURE_TERMS_REQUIRED");
    return prisma.featureAccessEvent.create({
      data: {
        acceptanceId: status.acceptanceId,
        context: context.slice(0, 255),
      },
    });
  }
}
