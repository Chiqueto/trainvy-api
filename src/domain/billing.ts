import type {
  BillingCycle,
  Prisma,
  Subscription,
} from "../generated/prisma/client.js";
import type { AsaasClient, AsaasPaymentDetails } from "../services/AsaasClient.js";
import { validCpf } from "./compliance.js";

export class BillingError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 502 | 503 = 400,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "BillingError";
  }
}

export const PAID_PAYMENT_STATUSES = new Set(["CONFIRMED", "RECEIVED"]);
export const CANCELLED_PAYMENT_STATUSES = new Set([
  "DELETED",
  "CANCELED",
  "REFUNDED",
]);

export function validCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    const sum = weights.reduce(
      (acc, weight, idx) => acc + Number(base[idx]) * weight,
      0,
    );
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(digits.slice(0, 12), w1);
  if (d1 !== Number(digits[12])) return false;

  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d2 = calcDigit(digits.slice(0, 13), w2);
  return d2 === Number(digits[13]);
}

export function validCpfOrCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return validCpf(digits);
  if (digits.length === 14) return validCnpj(digits);
  return false;
}

export function parseDueDateUtc(dueDate: string | null | undefined): Date | null {
  if (!dueDate) return null;
  const trimmed = dueDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function addUtcMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return result;
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function billingCycleMonths(billingCycle: BillingCycle): number {
  return billingCycle === "YEARLY" ? 12 : 1;
}

export function addBillingCycle(date: Date, billingCycle: BillingCycle): Date {
  return addUtcMonths(date, billingCycleMonths(billingCycle));
}

export function resolvePlanPriceInCents(
  plan: { monthlyPriceInCents: number; annualPriceInCents?: number | null },
  billingCycle: BillingCycle,
): number | null {
  if (billingCycle === "YEARLY") {
    return plan.annualPriceInCents ?? null;
  }
  return plan.monthlyPriceInCents;
}

/**
 * Converts a YYYY-MM-DD calendar date in America/Sao_Paulo (UTC-3) to its
 * start-of-day UTC instant, matching Marca-Lá's ZONE_SAO_PAULO semantics.
 */
export function saoPauloStartOfDay(dateStr: string): Date | null {
  const trimmed = dateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T03:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatDateBr(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function isCoolingOffActive(
  subscription: Pick<Subscription, "coolingOffUntil">,
  now: Date,
): boolean {
  return (
    subscription.coolingOffUntil !== null &&
    now.getTime() <= subscription.coolingOffUntil.getTime()
  );
}

export async function hasPendingBillingTransition(
  client: Pick<
    Prisma.TransactionClient,
    "subscriptionUpgrade" | "subscriptionDowngrade"
  >,
  subscriptionId: string,
): Promise<boolean> {
  const activeUpgrade = await client.subscriptionUpgrade.findFirst({
    where: {
      subscriptionId,
      status: { in: ["PENDING_PAYMENT", "PAID_PENDING_PROVIDER_SYNC"] },
    },
    select: { id: true },
  });
  if (activeUpgrade) return true;

  const pendingDowngrade = await client.subscriptionDowngrade.findFirst({
    where: {
      subscriptionId,
      OR: [
        { status: "SCHEDULED" },
        {
          status: "APPLIED",
          asaasSyncStatus: { in: ["PENDING_RETRY", "FAILED"] },
        },
        {
          status: "CANCELLED",
          asaasReversalStatus: { in: ["PENDING_RETRY", "FAILED"] },
        },
      ],
    },
    select: { id: true },
  });

  return Boolean(pendingDowngrade);
}

export async function logBillingAccessChange(
  client: Pick<Prisma.TransactionClient, "billingAccessLog">,
  params: {
    subscriptionId?: string | null;
    userId: string;
    action: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    reason?: string | null;
    source: string;
    sourceReferenceId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await client.billingAccessLog.create({
    data: {
      subscriptionId: params.subscriptionId ?? null,
      userId: params.userId,
      action: params.action,
      previousStatus: params.previousStatus ?? null,
      newStatus: params.newStatus ?? null,
      reason: params.reason ?? null,
      source: params.source,
      sourceReferenceId: params.sourceReferenceId ?? null,
      metadata: params.metadata,
    },
  });
}

export async function resolveEffectiveBillingCycleEnd(
  subscription: Subscription,
  asaasClient: AsaasClient,
  now = new Date(),
): Promise<Date> {
  if (subscription.paidUntil && subscription.paidUntil > now) {
    return subscription.paidUntil;
  }

  if (subscription.nextDueDate) {
    const dueIso = subscription.nextDueDate.toISOString().slice(0, 10);
    const effective = saoPauloStartOfDay(dueIso);
    if (effective && effective > now) {
      return effective;
    }
  }

  if (subscription.externalSubscriptionId) {
    const details = await asaasClient.getSubscriptionDetails(
      subscription.externalSubscriptionId,
      { userId: subscription.userId, subscriptionId: subscription.id },
    );
    if (details?.nextDueDate) {
      const effective = saoPauloStartOfDay(details.nextDueDate);
      if (effective && effective > now) {
        return effective;
      }
    }
  }

  throw new BillingError(
    "BILLING_CYCLE_END_UNAVAILABLE",
    409,
    "Não foi possível determinar com segurança a data da próxima renovação. Tente novamente em instantes.",
  );
}

export function isPaymentFutureAndEditable(
  payment: AsaasPaymentDetails,
  effectiveAt: Date,
): boolean {
  if (!payment.dueDate || !payment.status) return false;
  const upperStatus = payment.status.toUpperCase();
  if (upperStatus !== "PENDING" && upperStatus !== "OVERDUE") return false;
  const dueInstant = saoPauloStartOfDay(payment.dueDate);
  if (!dueInstant) return false;
  return dueInstant.getTime() >= effectiveAt.getTime();
}

export function buildSubscriptionCheckoutExternalReference(
  subscriptionId: string,
  planId: string,
): string {
  return `trainvy:sub:v1:${subscriptionId}:${planId}`;
}

export function parseSubscriptionCheckoutExternalReference(
  externalReference: string | null | undefined,
): { subscriptionId: string; planId?: string } | null {
  if (!externalReference) return null;
  if (externalReference.startsWith("trainvy:sub:v1:")) {
    const parts = externalReference.split(":");
    if (parts.length >= 5 && parts[3] && parts[4]) {
      return { subscriptionId: parts[3], planId: parts[4] };
    }
  }
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      externalReference,
    )
  ) {
    return { subscriptionId: externalReference };
  }
  return null;
}
