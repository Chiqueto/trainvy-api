-- Additive Asaas Billing Integration & Error-Only Log Tables

BEGIN;

ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "externalCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "firstPaymentConfirmedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "paidUntil" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "graceUntil" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "coolingOffUntil" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "nextDueDate" DATE,
  ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lastWebhookEventId" TEXT;

CREATE INDEX IF NOT EXISTS "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX IF NOT EXISTS "Subscription_paidUntil_idx" ON "Subscription"("paidUntil");
CREATE INDEX IF NOT EXISTS "Subscription_graceUntil_idx" ON "Subscription"("graceUntil");
CREATE INDEX IF NOT EXISTS "Subscription_externalCustomerId_idx" ON "Subscription"("externalCustomerId");

CREATE TABLE IF NOT EXISTS "subscription_payments" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "planId" TEXT,
  "provider" "BillingProvider" NOT NULL DEFAULT 'ASAAS',
  "providerPaymentId" TEXT,
  "providerSubscriptionId" TEXT,
  "providerCheckoutId" TEXT,
  "status" TEXT NOT NULL,
  "billingType" TEXT,
  "amountInCents" INTEGER NOT NULL CHECK ("amountInCents" >= 0),
  "netAmountInCents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "dueDate" DATE,
  "paidAt" TIMESTAMPTZ,
  "confirmedAt" TIMESTAMPTZ,
  "receivedAt" TIMESTAMPTZ,
  "refundedAt" TIMESTAMPTZ,
  "checkoutUrl" TEXT,
  "invoiceUrl" TEXT,
  "bankSlipUrl" TEXT,
  "pixCopyAndPaste" TEXT,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "subscription_payments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payments_providerPaymentId_key" ON "subscription_payments"("providerPaymentId");
CREATE INDEX IF NOT EXISTS "subscription_payments_subscriptionId_createdAt_idx" ON "subscription_payments"("subscriptionId", "createdAt");
CREATE INDEX IF NOT EXISTS "subscription_payments_providerSubscriptionId_idx" ON "subscription_payments"("providerSubscriptionId");
CREATE INDEX IF NOT EXISTS "subscription_payments_providerCheckoutId_idx" ON "subscription_payments"("providerCheckoutId");
CREATE INDEX IF NOT EXISTS "subscription_payments_status_idx" ON "subscription_payments"("status");

CREATE TABLE IF NOT EXISTS "billing_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" "BillingProvider" NOT NULL DEFAULT 'ASAAS',
  "providerEventId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "providerSubscriptionId" TEXT,
  "subscriptionId" TEXT,
  "subscriptionPaymentId" TEXT,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "processingStatus" TEXT NOT NULL,
  "errorMessage" TEXT,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_webhook_events_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "billing_webhook_events_subscriptionPaymentId_fkey" FOREIGN KEY ("subscriptionPaymentId") REFERENCES "subscription_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_webhook_events_idempotencyKey_key" ON "billing_webhook_events"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "billing_webhook_events_providerEventId_idx" ON "billing_webhook_events"("providerEventId");
CREATE INDEX IF NOT EXISTS "billing_webhook_events_providerPaymentId_idx" ON "billing_webhook_events"("providerPaymentId");
CREATE INDEX IF NOT EXISTS "billing_webhook_events_providerSubscriptionId_idx" ON "billing_webhook_events"("providerSubscriptionId");
CREATE INDEX IF NOT EXISTS "billing_webhook_events_processingStatus_receivedAt_idx" ON "billing_webhook_events"("processingStatus", "receivedAt");

CREATE TABLE IF NOT EXISTS "subscription_refunds" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "subscriptionPaymentId" TEXT,
  "provider" "BillingProvider" NOT NULL DEFAULT 'ASAAS',
  "providerPaymentId" TEXT,
  "providerRefundId" TEXT,
  "refundType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "amountInCents" INTEGER NOT NULL CHECK ("amountInCents" >= 0),
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ,
  "failedAt" TIMESTAMPTZ,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "subscription_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_refunds_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "subscription_refunds_subscriptionPaymentId_fkey" FOREIGN KEY ("subscriptionPaymentId") REFERENCES "subscription_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "subscription_refunds_subscriptionId_createdAt_idx" ON "subscription_refunds"("subscriptionId", "createdAt");
CREATE INDEX IF NOT EXISTS "subscription_refunds_status_idx" ON "subscription_refunds"("status");

CREATE TABLE IF NOT EXISTS "billing_access_logs" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousStatus" TEXT,
  "newStatus" TEXT,
  "reason" TEXT,
  "source" TEXT NOT NULL,
  "sourceReferenceId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_access_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_access_logs_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "billing_access_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "billing_access_logs_userId_createdAt_idx" ON "billing_access_logs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "billing_access_logs_subscriptionId_createdAt_idx" ON "billing_access_logs"("subscriptionId", "createdAt");

CREATE TABLE IF NOT EXISTS "subscription_upgrades" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "fromPlanId" TEXT NOT NULL,
  "targetPlanId" TEXT NOT NULL,
  "differenceInCents" INTEGER NOT NULL CHECK ("differenceInCents" > 0),
  "asaasPaymentId" TEXT,
  "invoiceUrl" TEXT,
  "externalReference" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "errorMessage" TEXT,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "paidAt" TIMESTAMPTZ,
  "appliedAt" TIMESTAMPTZ,
  "cancelledAt" TIMESTAMPTZ,
  "failedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "subscription_upgrades_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_upgrades_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "subscription_upgrades_fromPlanId_fkey" FOREIGN KEY ("fromPlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subscription_upgrades_targetPlanId_fkey" FOREIGN KEY ("targetPlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_upgrades_asaasPaymentId_key" ON "subscription_upgrades"("asaasPaymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_upgrades_externalReference_key" ON "subscription_upgrades"("externalReference");
CREATE UNIQUE INDEX IF NOT EXISTS "uk_sub_upgrades_active" ON "subscription_upgrades"("subscriptionId") WHERE "status" IN ('PENDING_PAYMENT', 'PAID_PENDING_PROVIDER_SYNC');
CREATE INDEX IF NOT EXISTS "subscription_upgrades_subscriptionId_status_idx" ON "subscription_upgrades"("subscriptionId", "status");
CREATE INDEX IF NOT EXISTS "subscription_upgrades_status_expiresAt_idx" ON "subscription_upgrades"("status", "expiresAt");

CREATE TABLE IF NOT EXISTS "subscription_downgrades" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "fromPlanId" TEXT NOT NULL,
  "targetPlanId" TEXT NOT NULL,
  "effectiveAt" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMPTZ NOT NULL,
  "retainedAthleteIds" JSONB,
  "preparedFuturePayments" JSONB,
  "asaasSyncStatus" TEXT NOT NULL,
  "asaasReversalStatus" TEXT,
  "errorMessage" TEXT,
  "cancelledAt" TIMESTAMPTZ,
  "appliedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "subscription_downgrades_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_downgrades_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "subscription_downgrades_fromPlanId_fkey" FOREIGN KEY ("fromPlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subscription_downgrades_targetPlanId_fkey" FOREIGN KEY ("targetPlanId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uk_sub_downgrades_active" ON "subscription_downgrades"("subscriptionId") WHERE "status" = 'SCHEDULED';
CREATE INDEX IF NOT EXISTS "subscription_downgrades_subscriptionId_status_idx" ON "subscription_downgrades"("subscriptionId", "status");
CREATE INDEX IF NOT EXISTS "subscription_downgrades_status_effectiveAt_idx" ON "subscription_downgrades"("status", "effectiveAt");

CREATE TABLE IF NOT EXISTS "asaas_error_logs" (
  "id" TEXT NOT NULL,
  "processName" TEXT NOT NULL,
  "errorType" TEXT NOT NULL,
  "httpStatus" INTEGER,
  "shortMessage" TEXT NOT NULL,
  "detailedStacktrace" TEXT,
  "requestMethod" TEXT,
  "requestPath" TEXT,
  "responseBody" TEXT,
  "userId" TEXT,
  "subscriptionId" TEXT,
  "externalReference" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asaas_error_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "asaas_error_logs_createdAt_idx" ON "asaas_error_logs"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "asaas_error_logs_processName_createdAt_idx" ON "asaas_error_logs"("processName", "createdAt");
CREATE INDEX IF NOT EXISTS "asaas_error_logs_userId_createdAt_idx" ON "asaas_error_logs"("userId", "createdAt");

COMMIT;
