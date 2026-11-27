import z from "zod";

import {
  BillingCycle,
  BillingProvider,
  EntitlementKey,
  SubscriptionStatus,
} from "../generated/prisma/enums.js";
import { IsoTimestamp } from "./iso-timestamp.js";

export const StartCoachSubscriptionBodySchema = z.strictObject({
  planCode: z.string().trim().min(1).max(80),
  cpfCnpj: z.string().trim().min(11).max(20),
  billingCycle: z.enum(BillingCycle).default("MONTHLY"),
});

export const StartCoachSubscriptionResponseSchema = z.object({
  subscriptionId: z.string(),
  planCode: z.string(),
  planName: z.string(),
  billingCycle: z.enum(BillingCycle),
  checkoutUrl: z.string(),
  status: z.enum(SubscriptionStatus),
  reusedExistingCheckout: z.boolean(),
  message: z.string(),
});

export const CancelCoachSubscriptionBodySchema = z
  .strictObject({
    reason: z.string().trim().max(500).optional(),
  })
  .optional();

export const CancelCoachSubscriptionResponseSchema = z.object({
  subscriptionId: z.string(),
  status: z.enum(SubscriptionStatus),
  cancelAtPeriodEnd: z.boolean(),
  paidUntil: IsoTimestamp.nullable(),
  refundRequested: z.boolean(),
  refundStatus: z.string().nullable(),
  message: z.string(),
});

export const UpgradeCoachSubscriptionBodySchema = z.strictObject({
  planCode: z.string().trim().min(1).max(80),
  billingCycle: z.enum(BillingCycle).optional(),
});

export const UpgradeCoachSubscriptionResponseSchema = z.object({
  upgradeId: z.string(),
  asaasPaymentId: z.string().nullable(),
  invoiceUrl: z.string().nullable(),
  differenceInCents: z.number().int(),
  fromPlanCode: z.string(),
  targetPlanCode: z.string(),
  targetPlanName: z.string(),
  fromBillingCycle: z.enum(BillingCycle),
  targetBillingCycle: z.enum(BillingCycle),
  status: z.string(),
  message: z.string(),
});

export const PendingUpgradeResponseSchema = z
  .object({
    upgradeId: z.string(),
    asaasPaymentId: z.string().nullable(),
    invoiceUrl: z.string().nullable(),
    differenceInCents: z.number().int(),
    fromPlanCode: z.string(),
    fromPlanName: z.string(),
    targetPlanCode: z.string(),
    targetPlanName: z.string(),
    fromBillingCycle: z.enum(BillingCycle),
    targetBillingCycle: z.enum(BillingCycle),
    status: z.string(),
    createdAt: IsoTimestamp,
    expiresAt: IsoTimestamp,
  })
  .nullable();

export const DowngradePreviewBodySchema = z.strictObject({
  planCode: z.string().trim().min(1).max(80),
  billingCycle: z.enum(BillingCycle).optional(),
});

export const DowngradePlanSummarySchema = z.object({
  code: z.string(),
  name: z.string(),
  monthlyPriceInCents: z.number().int(),
  annualPriceInCents: z.number().int().nullable(),
});

export const DowngradePreviewResponseSchema = z.object({
  effectiveAt: IsoTimestamp,
  fromPlan: DowngradePlanSummarySchema,
  targetPlan: DowngradePlanSummarySchema,
  targetAthleteLimit: z.number().int().nullable(),
  activeAthletesCount: z.number().int(),
  excessAthletesCount: z.number().int(),
  athletes: z.array(
    z.object({
      linkId: z.string(),
      athleteId: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      isManagedProfile: z.boolean(),
      createdAt: IsoTimestamp,
    }),
  ),
  hasPendingTransition: z.boolean(),
  pendingTransitionMessage: z.string().nullable(),
});

export const ScheduleDowngradeBodySchema = z.strictObject({
  planCode: z.string().trim().min(1).max(80),
  billingCycle: z.enum(BillingCycle).optional(),
  retainedAthleteIds: z.array(z.string().min(1)).max(500).optional(),
  acknowledgeExcessAthletes: z.boolean().optional(),
});

export const ScheduleDowngradeResponseSchema = z.object({
  downgradeId: z.string(),
  targetPlanCode: z.string(),
  targetPlanName: z.string(),
  fromBillingCycle: z.enum(BillingCycle),
  targetBillingCycle: z.enum(BillingCycle),
  effectiveAt: IsoTimestamp,
  status: z.string(),
  message: z.string(),
});

export const PendingDowngradeResponseSchema = z
  .object({
    downgradeId: z.string(),
    fromPlanCode: z.string(),
    fromPlanName: z.string(),
    targetPlanCode: z.string(),
    targetPlanName: z.string(),
    fromBillingCycle: z.enum(BillingCycle),
    targetBillingCycle: z.enum(BillingCycle),
    effectiveAt: IsoTimestamp,
    status: z.string(),
    asaasSyncStatus: z.string(),
    retainedAthleteIds: z.array(z.string()),
    createdAt: IsoTimestamp,
  })
  .nullable();

export const BillingSuccessResponseSchema = z.object({
  success: z.literal(true),
});

export const CoachBillingOverviewResponseSchema = z.object({
  accessActive: z.boolean(),
  pendingCheckoutUrl: z.string().nullable(),
  subscription: z
    .object({
      id: z.string(),
      planCode: z.string(),
      planName: z.string(),
      monthlyPriceInCents: z.number().int(),
      currency: z.string(),
      status: z.enum(SubscriptionStatus),
      billingProvider: z.enum(BillingProvider),
      billingCycle: z.enum(BillingCycle),
      trialEndsAt: IsoTimestamp.nullable(),
      currentPeriodStart: IsoTimestamp.nullable(),
      currentPeriodEnd: IsoTimestamp.nullable(),
      paidUntil: IsoTimestamp.nullable(),
      graceUntil: IsoTimestamp.nullable(),
      coolingOffUntil: IsoTimestamp.nullable(),
      nextDueDate: z.string().nullable(),
      cancelAtPeriodEnd: z.boolean(),
      canceledAt: IsoTimestamp.nullable(),
    })
    .nullable(),
  pendingUpgrade: PendingUpgradeResponseSchema,
  pendingDowngrade: PendingDowngradeResponseSchema,
  payments: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      billingType: z.string().nullable(),
      billingCycle: z.enum(BillingCycle),
      amountInCents: z.number().int(),
      netAmountInCents: z.number().int().nullable(),
      currency: z.string(),
      dueDate: z.string().nullable(),
      confirmedAt: IsoTimestamp.nullable(),
      receivedAt: IsoTimestamp.nullable(),
      refundedAt: IsoTimestamp.nullable(),
      checkoutUrl: z.string().nullable(),
      invoiceUrl: z.string().nullable(),
      bankSlipUrl: z.string().nullable(),
      createdAt: IsoTimestamp,
    }),
  ),
  refunds: z.array(
    z.object({
      id: z.string(),
      refundType: z.string(),
      status: z.string(),
      reason: z.string().nullable(),
      amountInCents: z.number().int(),
      currency: z.string(),
      requestedAt: IsoTimestamp,
      processedAt: IsoTimestamp.nullable(),
      failedAt: IsoTimestamp.nullable(),
    }),
  ),
  availablePlans: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      monthlyPriceInCents: z.number().int(),
      annualPriceInCents: z.number().int().nullable(),
      currency: z.string(),
      entitlements: z.array(
        z.object({
          entitlement: z.enum(EntitlementKey),
          limitValue: z.number().int().nullable(),
        }),
      ),
    }),
  ),
});

export const AsaasWebhookBodySchema = z.looseObject({
  id: z.string().nullable().optional(),
  event: z.string().min(1),
  payment: z
    .looseObject({
      id: z.string().nullable().optional(),
      customer: z.string().nullable().optional(),
      subscription: z.string().nullable().optional(),
      checkout: z.string().nullable().optional(),
      checkoutSession: z.string().nullable().optional(),
      paymentLink: z.string().nullable().optional(),
      status: z.string().nullable().optional(),
      billingType: z.string().nullable().optional(),
      value: z.number().nullable().optional(),
      netValue: z.number().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      paymentDate: z.string().nullable().optional(),
      clientPaymentDate: z.string().nullable().optional(),
      invoiceUrl: z.string().nullable().optional(),
      bankSlipUrl: z.string().nullable().optional(),
      externalReference: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  subscription: z
    .looseObject({
      id: z.string().nullable().optional(),
      customer: z.string().nullable().optional(),
      status: z.string().nullable().optional(),
      nextDueDate: z.string().nullable().optional(),
      externalReference: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const AsaasWebhookResponseSchema = z.object({
  received: z.boolean(),
  message: z.string(),
});

export const CronBillingReconciliationResponseSchema = z.object({
  pendingSubscriptionsChecked: z.number().int(),
  activePaymentsChecked: z.number().int(),
  expiredAccessChecked: z.number().int(),
  upgradesReconciled: z.number().int(),
  downgradesReconciled: z.number().int(),
});

export const AdminAsaasErrorsQuerySchema = z.strictObject({
  processName: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const AdminAsaasErrorLogItemSchema = z.object({
  id: z.string(),
  processName: z.string(),
  errorType: z.string(),
  httpStatus: z.number().int().nullable(),
  shortMessage: z.string(),
  detailedStacktrace: z.string().nullable(),
  requestMethod: z.string().nullable(),
  requestPath: z.string().nullable(),
  responseBody: z.string().nullable(),
  userId: z.string().nullable(),
  subscriptionId: z.string().nullable(),
  externalReference: z.string().nullable(),
  createdAt: IsoTimestamp,
});

export const AdminAsaasErrorsResponseSchema = z.object({
  items: z.array(AdminAsaasErrorLogItemSchema),
});
