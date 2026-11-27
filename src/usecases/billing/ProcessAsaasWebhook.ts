import { createHash, timingSafeEqual } from "node:crypto";

import {
  addBillingCycle,
  addUtcDays,
  addUtcMonths,
  logBillingAccessChange,
  parseDueDateUtc,
  parseSubscriptionCheckoutExternalReference,
  resolvePlanPriceInCents,
} from "../../domain/billing.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { BillingCycle } from "../../generated/prisma/enums.js";
import { prisma } from "../../lib/db.js";
import { AsaasClient, reaisToCents } from "../../services/AsaasClient.js";
import { logAsaasError } from "../../services/AsaasErrorLogger.js";
import {
  createUserNotification,
  deliverUserNotification,
} from "../../services/SendPushToUser.js";
import { applyPaidUpgradePayment } from "./UpgradeCoachSubscription.js";

export interface AsaasWebhookPaymentPayload {
  id?: string | null;
  customer?: string | null;
  subscription?: string | null;
  checkout?: string | null;
  checkoutSession?: string | null;
  paymentLink?: string | null;
  status?: string | null;
  billingType?: string | null;
  value?: number | null;
  netValue?: number | null;
  dueDate?: string | null;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  externalReference?: string | null;
  [key: string]: unknown;
}

export interface AsaasWebhookSubscriptionPayload {
  id?: string | null;
  customer?: string | null;
  status?: string | null;
  nextDueDate?: string | null;
  externalReference?: string | null;
  [key: string]: unknown;
}

export interface AsaasWebhookRequestPayload {
  id?: string | null;
  event: string;
  payment?: AsaasWebhookPaymentPayload | null;
  subscription?: AsaasWebhookSubscriptionPayload | null;
  [key: string]: unknown;
}

export function verifyAsaasWebhookToken(
  providedToken: string | undefined,
  configuredToken: string | undefined,
): boolean {
  if (!configuredToken || configuredToken.trim() === "") return false;
  if (!providedToken || providedToken.trim() === "") return false;
  const a = Buffer.from(providedToken, "utf8");
  const b = Buffer.from(configuredToken, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function firstNonBlank(
  ...values: Array<string | null | undefined>
): string | null {
  for (const val of values) {
    if (typeof val === "string" && val.trim() !== "") return val.trim();
  }
  return null;
}

export class ProcessAsaasWebhook {
  constructor(private readonly asaasClient = new AsaasClient()) {}

  async execute(
    request: AsaasWebhookRequestPayload,
    options?: { source?: "ASAAS_BILLING_WEBHOOK" | "ASAAS_RECONCILIATION"; customIdempotencyKey?: string },
  ): Promise<{ processed: boolean; duplicate: boolean; status: string }> {
    const source = options?.source ?? "ASAAS_BILLING_WEBHOOK";
    const event = request.event;
    const payment = request.payment ?? null;
    const subPayload = request.subscription ?? null;
    const payloadJson = JSON.stringify(request);
    const payloadHash = sha256Hex(payloadJson);

    const idempotencyKey =
      options?.customIdempotencyKey ??
      (payment?.id
        ? `ASAAS:${event}:${payment.id}:${payment.status ?? "UNKNOWN"}`
        : subPayload?.id
          ? `ASAAS:${event}:${subPayload.id}:${request.id ?? payloadHash}`
          : `ASAAS:${event}:${request.id ?? payloadHash}`);

    const existingEvent = await prisma.billingWebhookEvent.findUnique({
      where: { idempotencyKey },
    });

    if (existingEvent && existingEvent.processingStatus !== "FAILED") {
      return {
        processed: true,
        duplicate: true,
        status: existingEvent.processingStatus,
      };
    }

    const matchedPayment = await this.findSubscriptionPayment(payment);
    const matchedSub = await this.findSubscription(
      payment,
      subPayload,
      matchedPayment,
    );

    const webhookEvent = existingEvent
      ? await prisma.billingWebhookEvent.update({
          where: { id: existingEvent.id },
          data: {
            processingStatus: "RECEIVED",
            errorMessage: null,
            subscriptionId: matchedSub?.id ?? existingEvent.subscriptionId,
            subscriptionPaymentId:
              matchedPayment?.id ?? existingEvent.subscriptionPaymentId,
          },
        })
      : await prisma.billingWebhookEvent.create({
          data: {
            provider: "ASAAS",
            providerEventId: request.id ?? null,
            idempotencyKey,
            eventType: event,
            providerPaymentId: payment?.id ?? null,
            providerSubscriptionId:
              payment?.subscription ?? subPayload?.id ?? null,
            subscriptionId: matchedSub?.id ?? null,
            subscriptionPaymentId: matchedPayment?.id ?? null,
            payload: request as unknown as Prisma.InputJsonValue,
            payloadHash,
            processingStatus: matchedSub ? "RECEIVED" : "IGNORED",
            errorMessage: matchedSub
              ? null
              : "Assinatura interna não encontrada para o evento.",
            processedAt: matchedSub ? null : new Date(),
          },
        });

    if (!matchedSub) {
      return { processed: true, duplicate: false, status: "IGNORED" };
    }

    try {
      const result = await this.processEventForSubscription({
        request,
        webhookEventId: webhookEvent.id,
        subscriptionId: matchedSub.id,
        initialPaymentId: matchedPayment?.id ?? null,
        source,
      });

      return {
        processed: true,
        duplicate: false,
        status: result.status,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao processar evento Asaas";
      await prisma.billingWebhookEvent
        .update({
          where: { id: webhookEvent.id },
          data: {
            processingStatus: "FAILED",
            errorMessage: message.slice(0, 1000),
            processedAt: new Date(),
          },
        })
        .catch(() => {});

      await logAsaasError({
        processName: "ProcessAsaasWebhook.execute",
        error,
        subscriptionId: matchedSub.id,
        userId: matchedSub.userId,
        externalReference: payment?.externalReference ?? undefined,
      });

      throw error;
    }
  }

  private async processEventForSubscription(params: {
    request: AsaasWebhookRequestPayload;
    webhookEventId: string;
    subscriptionId: string;
    initialPaymentId: string | null;
    source: string;
  }): Promise<{ status: "PROCESSED" | "IGNORED" }> {
    const { request, webhookEventId, subscriptionId, initialPaymentId, source } =
      params;
    const event = request.event;
    const payload = request.payment ?? null;
    const subPayload = request.subscription ?? null;
    const now = new Date();

    // 1. Eventos de ciclo de vida da assinatura (SUBSCRIPTION_DELETED / SUBSCRIPTION_INACTIVATED)
    if (!payload && subPayload && event.startsWith("SUBSCRIPTION_")) {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${subscriptionId} FOR UPDATE`;
        const sub = await tx.subscription.findUnique({
          where: { id: subscriptionId },
        });
        if (!sub) return;

        if (
          (event === "SUBSCRIPTION_DELETED" ||
            event === "SUBSCRIPTION_INACTIVATED") &&
          sub.status !== "CANCELED"
        ) {
          const prevStatus = sub.status;
          const keepUntilEnd =
            sub.paidUntil !== null && sub.paidUntil > now;
          await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: "CANCELED",
              cancelAtPeriodEnd: keepUntilEnd,
              canceledAt: sub.canceledAt ?? now,
              blockedAt: keepUntilEnd ? null : now,
              lastWebhookEventId: webhookEventId,
              lastSyncedAt: now,
            },
          });
          await logBillingAccessChange(tx, {
            subscriptionId: sub.id,
            userId: sub.userId,
            action: "SUBSCRIPTION_STATUS_CHANGED",
            previousStatus: prevStatus,
            newStatus: "CANCELED",
            reason: event,
            source,
            sourceReferenceId: webhookEventId,
          });
        }

        await tx.billingWebhookEvent.update({
          where: { id: webhookEventId },
          data: {
            processingStatus: "PROCESSED",
            processedAt: now,
          },
        });
      });
      return { status: "PROCESSED" };
    }

    // 2. Roteamento de Pagamentos Avulsos (Upgrade)
    if (payload && !payload.subscription) {
      const upgrade = await this.findUpgradeForPayment(payload);
      if (upgrade) {
        await this.processUpgradeWebhookEvent(
          event,
          upgrade.id,
          webhookEventId,
          payload,
          now,
        );
        return { status: "PROCESSED" };
      }

      // Se houver pagamento ligado a checkout inicial (paymentLink) sem subscription ainda, segue fluxo normal; senão ignora avulso desconhecido
      const hasCheckoutMatch = Boolean(
        initialPaymentId ||
          payload.paymentLink ||
          payload.checkout ||
          payload.checkoutSession ||
          parseSubscriptionCheckoutExternalReference(payload.externalReference),
      );
      if (!hasCheckoutMatch) {
        await prisma.billingWebhookEvent.update({
          where: { id: webhookEventId },
          data: {
            processingStatus: "IGNORED",
            errorMessage: "Pagamento avulso sem assinatura ou upgrade correspondente.",
            processedAt: now,
          },
        });
        return { status: "IGNORED" };
      }
    }

    // 3. Fluxo principal de pagamento de assinatura
    let notificationToDeliver: Awaited<
      ReturnType<typeof createUserNotification>
    > = null;

    const status = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${subscriptionId} FOR UPDATE`;
      const sub = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        include: { plan: true },
      });
      if (!sub) return "IGNORED" as const;

      let paymentRecord = initialPaymentId
        ? await tx.subscriptionPayment.findUnique({
            where: { id: initialPaymentId },
          })
        : null;

      if (!paymentRecord && payload) {
        const checkoutId = firstNonBlank(
          payload.checkout,
          payload.paymentLink,
          payload.checkoutSession,
        );
        const parsedRef = parseSubscriptionCheckoutExternalReference(
          payload.externalReference,
        );
        paymentRecord = await tx.subscriptionPayment.create({
          data: {
            subscriptionId: sub.id,
            planId: parsedRef?.planId ?? sub.planId,
            billingCycle: sub.billingCycle,
            provider: "ASAAS",
            providerPaymentId: payload.id ?? null,
            providerSubscriptionId: payload.subscription ?? null,
            providerCheckoutId: checkoutId,
            status: "CREATED",
            amountInCents:
              reaisToCents(payload.value) ?? sub.priceInCentsSnapshot,
            currency: sub.currencySnapshot,
          },
        });
      }

      let previousPaymentStatus: string | null = null;
      if (paymentRecord && payload) {
        previousPaymentStatus = paymentRecord.status;
        paymentRecord = await this.updatePaymentDetails(
          tx,
          paymentRecord.id,
          payload,
          event,
          now,
        );
      }

      const applied = await this.applyAccessRules(tx, {
        event,
        sub,
        paymentRecord,
        payload,
        webhookEventId,
        now,
      });

      if (applied.notification) {
        notificationToDeliver = await createUserNotification(
          {
            userId: sub.userId,
            ...applied.notification,
          },
          tx,
        );
      } else if (
        (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") &&
        previousPaymentStatus === "OVERDUE"
      ) {
        notificationToDeliver = await createUserNotification(
          {
            userId: sub.userId,
            type: "BILLING_PAYMENT_REGULARIZED",
            title: "Pagamento regularizado",
            body: "Sua assinatura Trainvy foi regularizada e segue ativa.",
            url:
              sub.plan.audience === "ATHLETE"
                ? "/assinatura"
                : "/personal/assinatura",
          },
          tx,
        );
      }

      await tx.billingWebhookEvent.update({
        where: { id: webhookEventId },
        data: {
          subscriptionPaymentId: paymentRecord?.id ?? null,
          processingStatus: applied.applied ? "PROCESSED" : "IGNORED",
          processedAt: now,
        },
      });

      return applied.applied ? ("PROCESSED" as const) : ("IGNORED" as const);
    });

    if (notificationToDeliver) {
      await deliverUserNotification(notificationToDeliver).catch(() => {});
    }

    return { status };
  }

  private async processUpgradeWebhookEvent(
    event: string,
    upgradeId: string,
    webhookEventId: string,
    payload: AsaasWebhookPaymentPayload,
    now: Date,
  ) {
    const upgrade = await prisma.subscriptionUpgrade.findUnique({
      where: { id: upgradeId },
      include: { subscription: true },
    });
    if (!upgrade) return;

    await prisma.$transaction(async (tx) => {
      if (!upgrade.asaasPaymentId && payload.id) {
        await tx.subscriptionUpgrade.update({
          where: { id: upgrade.id },
          data: {
            asaasPaymentId: payload.id,
            invoiceUrl: upgrade.invoiceUrl ?? payload.invoiceUrl ?? null,
            errorMessage: null,
          },
        });
      }

      let paymentRecord = payload.id
        ? await tx.subscriptionPayment.findUnique({
            where: { providerPaymentId: payload.id },
          })
        : null;

      if (!paymentRecord) {
        paymentRecord = await tx.subscriptionPayment.create({
          data: {
            subscriptionId: upgrade.subscriptionId,
            planId: upgrade.targetPlanId,
            provider: "ASAAS",
            providerPaymentId: payload.id ?? null,
            status: "CREATED",
            amountInCents:
              reaisToCents(payload.value) ?? upgrade.differenceInCents,
            currency: "BRL",
          },
        });
      }

      await this.updatePaymentDetails(tx, paymentRecord.id, payload, event, now);

      if (event === "PAYMENT_DELETED") {
        if (
          !["EXPIRED", "CANCELLED", "APPLIED"].includes(upgrade.status)
        ) {
          await tx.subscriptionUpgrade.update({
            where: { id: upgrade.id },
            data: { status: "CANCELLED", cancelledAt: now },
          });
        }
      } else if (event === "PAYMENT_REFUNDED") {
        await logBillingAccessChange(tx, {
          subscriptionId: upgrade.subscriptionId,
          userId: upgrade.subscription.userId,
          action: "UPGRADE_PAYMENT_REFUNDED",
          reason: "UPGRADE_PAYMENT_REFUNDED",
          source: "ASAAS_BILLING_WEBHOOK",
          sourceReferenceId: payload.id ?? webhookEventId,
        });
      }

      await tx.subscription.update({
        where: { id: upgrade.subscriptionId },
        data: { lastWebhookEventId: webhookEventId, lastSyncedAt: now },
      });

      await tx.billingWebhookEvent.update({
        where: { id: webhookEventId },
        data: {
          subscriptionPaymentId: paymentRecord.id,
          processingStatus: "PROCESSED",
          processedAt: now,
        },
      });
    });

    if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
      await applyPaidUpgradePayment(upgrade.id, event, this.asaasClient);
    }
  }

  private async updatePaymentDetails(
    tx: Prisma.TransactionClient,
    paymentId: string,
    payload: AsaasWebhookPaymentPayload,
    event: string,
    now: Date,
  ) {
    const existing = await tx.subscriptionPayment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    const checkoutId = firstNonBlank(
      payload.checkout,
      payload.paymentLink,
      payload.checkoutSession,
    );
    const parsedDueDate = parseDueDateUtc(payload.dueDate);

    let nextStatus = existing.status;
    let confirmedAt = existing.confirmedAt;
    let receivedAt = existing.receivedAt;
    let refundedAt = existing.refundedAt;

    switch (event) {
      case "PAYMENT_CREATED":
        if (!existing.status || existing.status === "CREATED") {
          nextStatus = "PENDING";
        }
        break;
      case "PAYMENT_CONFIRMED":
        nextStatus = "CONFIRMED";
        confirmedAt = confirmedAt ?? now;
        break;
      case "PAYMENT_RECEIVED":
        nextStatus = "RECEIVED";
        receivedAt = receivedAt ?? now;
        break;
      case "PAYMENT_OVERDUE":
        nextStatus = "OVERDUE";
        break;
      case "PAYMENT_REFUNDED":
        nextStatus = "REFUNDED";
        refundedAt = refundedAt ?? now;
        break;
      case "PAYMENT_DELETED":
        nextStatus = "CANCELED";
        break;
      case "PAYMENT_CHARGEBACK_REQUESTED":
        nextStatus = "CHARGEBACK_REQUESTED";
        break;
      case "PAYMENT_CHARGEBACK_DISPUTE":
        nextStatus = "CHARGEBACK_DISPUTE";
        break;
      case "PAYMENT_CHARGEBACK":
      case "PAYMENT_AWAITING_CHARGEBACK_REVERSAL":
        nextStatus = "CHARGEBACK";
        break;
    }

    return tx.subscriptionPayment.update({
      where: { id: paymentId },
      data: {
        providerPaymentId: payload.id ?? existing.providerPaymentId,
        providerSubscriptionId:
          payload.subscription ?? existing.providerSubscriptionId,
        providerCheckoutId: checkoutId ?? existing.providerCheckoutId,
        billingType: payload.billingType ?? existing.billingType,
        amountInCents: reaisToCents(payload.value) ?? existing.amountInCents,
        netAmountInCents:
          reaisToCents(payload.netValue) ?? existing.netAmountInCents,
        dueDate: parsedDueDate ?? existing.dueDate,
        invoiceUrl: payload.invoiceUrl ?? existing.invoiceUrl,
        bankSlipUrl: payload.bankSlipUrl ?? existing.bankSlipUrl,
        status: nextStatus,
        confirmedAt,
        receivedAt,
        refundedAt,
        rawPayload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async applyAccessRules(
    tx: Prisma.TransactionClient,
    params: {
      event: string;
      sub: Prisma.SubscriptionGetPayload<{ include: { plan: true } }>;
      paymentRecord: {
        id: string;
        planId: string | null;
        billingCycle?: BillingCycle;
      } | null;
      payload: AsaasWebhookPaymentPayload | null;
      webhookEventId: string;
      now: Date;
    },
  ): Promise<{
    applied: boolean;
    notification?: {
      type: string;
      title: string;
      body: string;
      url: string;
    };
  }> {
    const { event, sub, paymentRecord, payload, webhookEventId, now } = params;
    const prevStatus = sub.status;

    switch (event) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED": {
        const targetPlanId = paymentRecord?.planId ?? sub.planId;
        const targetPlan =
          targetPlanId !== sub.planId
            ? await tx.plan.findUnique({ where: { id: targetPlanId } })
            : sub.plan;
        const targetCycle: BillingCycle =
          paymentRecord?.billingCycle ?? sub.billingCycle;
        const cyclePriceInCents = targetPlan
          ? (resolvePlanPriceInCents(targetPlan, targetCycle) ??
            sub.priceInCentsSnapshot)
          : sub.priceInCentsSnapshot;

        if (payload?.customer) {
          await tx.billingCustomer.upsert({
            where: {
              userId_provider: { userId: sub.userId, provider: "ASAAS" },
            },
            create: {
              userId: sub.userId,
              provider: "ASAAS",
              externalCustomerId: payload.customer,
            },
            update: { externalCustomerId: payload.customer },
          });
        }

        const dueDate = parseDueDateUtc(payload?.dueDate);
        const fallbackPeriodEnd =
          targetCycle === "YEARLY"
            ? addUtcDays(now, 365)
            : addUtcDays(now, 30);
        const candidatePaidUntil = dueDate
          ? addBillingCycle(dueDate, targetCycle)
          : fallbackPeriodEnd;
        const paidUntil =
          candidatePaidUntil > now ? candidatePaidUntil : fallbackPeriodEnd;
        const graceUntil = addUtcDays(paidUntil, 3);
        const currentPeriodStart = dueDate && dueDate <= now ? dueDate : now;
        const nextDueDate = dueDate
          ? addBillingCycle(dueDate, targetCycle)
          : addBillingCycle(
              new Date(
                Date.UTC(
                  now.getUTCFullYear(),
                  now.getUTCMonth(),
                  now.getUTCDate(),
                ),
              ),
              targetCycle,
            );
        const firstConfirmed = sub.firstPaymentConfirmedAt ?? now;
        const coolingOffUntil =
          sub.coolingOffUntil ?? addUtcDays(firstConfirmed, 7);

        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            planId: targetPlan?.id ?? sub.planId,
            billingCycle: targetCycle,
            priceInCentsSnapshot: cyclePriceInCents,
            currencySnapshot: targetPlan?.currency ?? sub.currencySnapshot,
            billingProvider: "ASAAS",
            status: "ACTIVE",
            externalCustomerId: payload?.customer ?? sub.externalCustomerId,
            externalSubscriptionId:
              payload?.subscription ?? sub.externalSubscriptionId,
            firstPaymentConfirmedAt: firstConfirmed,
            coolingOffUntil,
            currentPeriodStart,
            currentPeriodEnd: paidUntil,
            paidUntil,
            graceUntil,
            nextDueDate,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            blockedAt: null,
            lastWebhookEventId: webhookEventId,
            lastSyncedAt: now,
          },
        });

        await logBillingAccessChange(tx, {
          subscriptionId: sub.id,
          userId: sub.userId,
          action: "ACCESS_STATUS_CHANGED",
          previousStatus: prevStatus,
          newStatus: "ACTIVE",
          reason: event,
          source: "ASAAS_BILLING_WEBHOOK",
          sourceReferenceId: webhookEventId,
        });

        const billingUrl =
          targetPlan?.audience === "ATHLETE"
            ? "/assinatura"
            : "/personal/assinatura";

        return {
          applied: true,
          notification:
            prevStatus !== "ACTIVE" || targetPlan?.id !== sub.planId
              ? {
                  type: "BILLING_PAYMENT_CONFIRMED",
                  title: "Assinatura ativa",
                  body: `Seu plano ${targetPlan?.name ?? ""} foi confirmado e já está ativo.`,
                  url: billingUrl,
                }
              : undefined,
        };
      }

      case "PAYMENT_OVERDUE": {
        const dueDate = parseDueDateUtc(payload?.dueDate);
        const graceUntil =
          sub.graceUntil ??
          (dueDate ? addUtcDays(dueDate, 3) : addUtcDays(now, 3));
        const blockedAt = graceUntil <= now ? now : sub.blockedAt;

        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: "PAST_DUE",
            graceUntil,
            blockedAt,
            lastWebhookEventId: webhookEventId,
            lastSyncedAt: now,
          },
        });

        await logBillingAccessChange(tx, {
          subscriptionId: sub.id,
          userId: sub.userId,
          action: "ACCESS_STATUS_CHANGED",
          previousStatus: prevStatus,
          newStatus: "PAST_DUE",
          reason: event,
          source: "ASAAS_BILLING_WEBHOOK",
          sourceReferenceId: webhookEventId,
        });

        return {
          applied: true,
          notification: {
            type: "BILLING_PAYMENT_OVERDUE",
            title: "Pagamento em atraso",
            body: "Identificamos uma cobrança vencida na sua assinatura. Regularize para manter seu plano ativo.",
            url:
              sub.plan.audience === "ATHLETE"
                ? "/assinatura"
                : "/personal/assinatura",
          },
        };
      }

      case "PAYMENT_REFUNDED":
      case "PAYMENT_CHARGEBACK_REQUESTED":
      case "PAYMENT_CHARGEBACK_DISPUTE":
      case "PAYMENT_CHARGEBACK":
      case "PAYMENT_AWAITING_CHARGEBACK_REVERSAL": {
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: "CANCELED",
            cancelAtPeriodEnd: false,
            canceledAt: sub.canceledAt ?? now,
            blockedAt: now,
            currentPeriodEnd: now,
            paidUntil: now,
            graceUntil: null,
            lastWebhookEventId: webhookEventId,
            lastSyncedAt: now,
          },
        });

        await logBillingAccessChange(tx, {
          subscriptionId: sub.id,
          userId: sub.userId,
          action: "ACCESS_STATUS_CHANGED",
          previousStatus: prevStatus,
          newStatus: "CANCELED",
          reason: event,
          source: "ASAAS_BILLING_WEBHOOK",
          sourceReferenceId: webhookEventId,
        });

        return { applied: true };
      }

      case "PAYMENT_CREATED": {
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            externalCustomerId: payload?.customer ?? sub.externalCustomerId,
            externalSubscriptionId:
              payload?.subscription ?? sub.externalSubscriptionId,
            lastWebhookEventId: webhookEventId,
            lastSyncedAt: now,
          },
        });
        return { applied: true };
      }

      default:
        return { applied: false };
    }
  }

  private async findSubscriptionPayment(
    payment: AsaasWebhookPaymentPayload | null,
  ) {
    if (!payment) return null;

    if (payment.id) {
      const byId = await prisma.subscriptionPayment.findUnique({
        where: { providerPaymentId: payment.id },
      });
      if (byId) return byId;
    }

    if (payment.subscription) {
      const bySub = await prisma.subscriptionPayment.findFirst({
        where: { providerSubscriptionId: payment.subscription },
        orderBy: { createdAt: "desc" },
      });
      if (bySub) return bySub;
    }

    const checkoutId = firstNonBlank(
      payment.checkout,
      payment.paymentLink,
      payment.checkoutSession,
    );
    if (checkoutId) {
      const byCheckout = await prisma.subscriptionPayment.findFirst({
        where: { providerCheckoutId: checkoutId },
        orderBy: { createdAt: "desc" },
      });
      if (byCheckout) return byCheckout;
    }

    return null;
  }

  private async findUpgradeForPayment(payment: AsaasWebhookPaymentPayload) {
    if (payment.id) {
      const byPayment = await prisma.subscriptionUpgrade.findUnique({
        where: { asaasPaymentId: payment.id },
      });
      if (byPayment) return byPayment;
    }
    if (payment.externalReference?.startsWith("trainvy:upgrade:v1:")) {
      return prisma.subscriptionUpgrade.findUnique({
        where: { externalReference: payment.externalReference },
      });
    }
    return null;
  }

  private async findSubscription(
    payment: AsaasWebhookPaymentPayload | null,
    subPayload: AsaasWebhookSubscriptionPayload | null,
    matchedPayment: { subscriptionId: string } | null,
  ) {
    if (matchedPayment) {
      const sub = await prisma.subscription.findUnique({
        where: { id: matchedPayment.subscriptionId },
      });
      if (sub) return sub;
    }

    const providerSubId = payment?.subscription ?? subPayload?.id;
    if (providerSubId) {
      const byExternalSub = await prisma.subscription.findFirst({
        where: {
          billingProvider: "ASAAS",
          externalSubscriptionId: providerSubId,
        },
      });
      if (byExternalSub) return byExternalSub;
    }

    if (payment) {
      const upgrade = await this.findUpgradeForPayment(payment);
      if (upgrade) {
        return prisma.subscription.findUnique({
          where: { id: upgrade.subscriptionId },
        });
      }
    }

    const extRef = payment?.externalReference ?? subPayload?.externalReference;
    const parsedRef = parseSubscriptionCheckoutExternalReference(extRef);
    if (parsedRef) {
      const byRef = await prisma.subscription.findUnique({
        where: { id: parsedRef.subscriptionId },
      });
      if (byRef) return byRef;
    }

    return null;
  }
}
