
CREATE TABLE "FeatureTermsAcceptance" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "feature" TEXT NOT NULL,
 "version" TEXT NOT NULL, "textHash" TEXT NOT NULL, "title" TEXT NOT NULL, "text" TEXT NOT NULL,
 "acceptedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "ipAddress" TEXT NOT NULL, "userAgent" TEXT,
 CONSTRAINT "FeatureTermsAcceptance_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "FeatureTermsAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FeatureTermsAcceptance_userId_feature_version_textHash_key" ON "FeatureTermsAcceptance"("userId", "feature", "version", "textHash");
CREATE INDEX "FeatureTermsAcceptance_userId_acceptedAt_idx" ON "FeatureTermsAcceptance"("userId", "acceptedAt");
CREATE TABLE "FeatureAccessEvent" (
 "id" TEXT NOT NULL, "acceptanceId" TEXT NOT NULL, "context" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FeatureAccessEvent_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "FeatureAccessEvent_acceptanceId_fkey" FOREIGN KEY ("acceptanceId") REFERENCES "FeatureTermsAcceptance"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FeatureAccessEvent_acceptanceId_createdAt_idx" ON "FeatureAccessEvent"("acceptanceId", "createdAt");
