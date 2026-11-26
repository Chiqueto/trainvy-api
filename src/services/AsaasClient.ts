import { env } from "../lib/env.js";
import { logAsaasError } from "./AsaasErrorLogger.js";

export type AsaasEnvironment = "SANDBOX" | "PRODUCTION";

export interface AsaasPaymentDetails {
  id: string;
  customer?: string | null;
  subscription?: string | null;
  checkoutSession?: string | null;
  paymentLink?: string | null;
  status?: string | null;
  billingType?: string | null;
  value?: number | null;
  netValue?: number | null;
  dueDate?: string | null;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  externalReference?: string | null;
  [key: string]: unknown;
}

export interface AsaasSubscriptionDetails {
  id: string;
  customer?: string | null;
  status?: string | null;
  billingType?: string | null;
  value?: number | null;
  nextDueDate?: string | null;
  cycle?: string | null;
  description?: string | null;
  externalReference?: string | null;
}

export interface AsaasCheckoutResult {
  checkoutId: string;
  url: string;
}

export interface AsaasOneTimePaymentResult {
  paymentId: string;
  invoiceUrl: string | null;
}

export interface AsaasRefundResult {
  success: boolean;
  refundId: string | null;
  status: string;
  rawPayload: Record<string, unknown> | null;
}

export class AsaasConfigurationError extends Error {
  readonly code = "ASAAS_NOT_CONFIGURED";
  readonly status = 503 as const;

  constructor(message = "Integração de pagamentos Asaas não está configurada.") {
    super(message);
    this.name = "AsaasConfigurationError";
  }
}

export class AsaasIntegrationError extends Error {
  readonly code = "ASAAS_INTEGRATION_ERROR";
  readonly status = 502 as const;

  constructor(message: string) {
    super(message);
    this.name = "AsaasIntegrationError";
  }
}

export function centsToReais(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export function reaisToCents(reais: number | null | undefined): number | null {
  if (typeof reais !== "number" || !Number.isFinite(reais)) return null;
  return Math.round(reais * 100);
}

export function getAsaasBaseUrl(
  environment: AsaasEnvironment = env.ASAAS_ENVIRONMENT,
): string {
  return environment === "PRODUCTION"
    ? "https://api.asaas.com"
    : "https://api-sandbox.asaas.com";
}

function addUtcDaysIsoDate(days: number): string {
  const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return target.toISOString().slice(0, 10);
}

interface AsaasRequestContext {
  processName: string;
  userId?: string;
  subscriptionId?: string;
  externalReference?: string;
}

export class AsaasClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly userAgent: string;
  private readonly successUrl: string | undefined;

  constructor(options?: {
    apiKey?: string;
    environment?: AsaasEnvironment;
    userAgent?: string;
    successUrl?: string;
  }) {
    this.baseUrl = getAsaasBaseUrl(options?.environment ?? env.ASAAS_ENVIRONMENT);
    this.apiKey = options?.apiKey ?? env.ASAAS_API_KEY;
    this.userAgent = options?.userAgent ?? env.ASAAS_USER_AGENT;
    this.successUrl =
      options?.successUrl ??
      env.BILLING_CHECKOUT_SUCCESS_URL ??
      `${env.WEB_APP_BASE_URL.replace(/\/+$/, "")}/personal/assinatura?checkout=success`;
  }

  private async ensureApiKey(ctx: AsaasRequestContext): Promise<string> {
    if (!this.apiKey || this.apiKey.trim() === "") {
      const error = new AsaasConfigurationError();
      await logAsaasError({
        processName: ctx.processName,
        error,
        userId: ctx.userId,
        subscriptionId: ctx.subscriptionId,
        externalReference: ctx.externalReference,
      });
      throw error;
    }
    return this.apiKey;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    ctx: AsaasRequestContext,
    body?: Record<string, unknown>,
  ): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number | null; rawBody: string | null; error: Error }> {
    const apiKey = await this.ensureApiKey(ctx);
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": this.userAgent,
          access_token: apiKey,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
      });

      const rawText = await response.text();
      if (!response.ok) {
        const err = new AsaasIntegrationError(
          `Asaas HTTP ${response.status} on ${method} ${path}`,
        );
        await logAsaasError({
          processName: ctx.processName,
          error: err,
          httpStatus: response.status,
          requestMethod: method,
          requestPath: path,
          responseBody: rawText,
          userId: ctx.userId,
          subscriptionId: ctx.subscriptionId,
          externalReference: ctx.externalReference,
        });
        return { ok: false, status: response.status, rawBody: rawText, error: err };
      }

      const data = rawText ? (JSON.parse(rawText) as T) : ({} as T);
      return { ok: true, status: response.status, data };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await logAsaasError({
        processName: ctx.processName,
        error: err,
        requestMethod: method,
        requestPath: path,
        userId: ctx.userId,
        subscriptionId: ctx.subscriptionId,
        externalReference: ctx.externalReference,
      });
      return { ok: false, status: null, rawBody: null, error: err };
    }
  }

  async createSubscriptionCheckout(params: {
    planName: string;
    planDescription: string | null;
    monthlyPriceInCents: number;
    externalReference: string;
    userId: string;
    subscriptionId: string;
  }): Promise<AsaasCheckoutResult | null> {
    const payload: Record<string, unknown> = {
      name: `Assinatura ${params.planName}`,
      description:
        params.planDescription?.trim() || `Plano ${params.planName} - Trainvy`,
      value: centsToReais(params.monthlyPriceInCents),
      billingType: "UNDEFINED",
      chargeType: "RECURRENT",
      subscriptionCycle: "MONTHLY",
      externalReference: params.externalReference,
      dueDateLimitDays: 3,
    };

    if (this.successUrl) {
      payload.callback = {
        successUrl: this.successUrl,
        autoRedirect: true,
      };
    }

    const res = await this.request<{ id?: string; url?: string }>(
      "POST",
      "/v3/paymentLinks",
      {
        processName: "AsaasClient.createSubscriptionCheckout",
        userId: params.userId,
        subscriptionId: params.subscriptionId,
        externalReference: params.externalReference,
      },
      payload,
    );

    if (!res.ok) return null;
    if (!res.data.id || !res.data.url) {
      await logAsaasError({
        processName: "AsaasClient.createSubscriptionCheckout",
        error: new AsaasIntegrationError("Asaas paymentLink response missing id or url"),
        httpStatus: res.status,
        requestMethod: "POST",
        requestPath: "/v3/paymentLinks",
        responseBody: JSON.stringify(res.data),
        userId: params.userId,
        subscriptionId: params.subscriptionId,
        externalReference: params.externalReference,
      });
      return null;
    }

    return { checkoutId: res.data.id, url: res.data.url };
  }

  async createOneTimePayment(params: {
    customerId: string;
    amountInCents: number;
    description: string;
    externalReference: string;
    dueDateLimitDays?: number;
    userId: string;
    subscriptionId: string;
  }): Promise<AsaasOneTimePaymentResult> {
    const payload: Record<string, unknown> = {
      customer: params.customerId,
      billingType: "UNDEFINED",
      value: centsToReais(params.amountInCents),
      dueDate: addUtcDaysIsoDate(params.dueDateLimitDays ?? 3),
      description: params.description,
      externalReference: params.externalReference,
    };

    const res = await this.request<{ id?: string; invoiceUrl?: string | null }>(
      "POST",
      "/v3/payments",
      {
        processName: "AsaasClient.createOneTimePayment",
        userId: params.userId,
        subscriptionId: params.subscriptionId,
        externalReference: params.externalReference,
      },
      payload,
    );

    if (res.ok && res.data.id) {
      return {
        paymentId: res.data.id,
        invoiceUrl: res.data.invoiceUrl ?? null,
      };
    }

    // Reconcile on timeout/network failure (matching Marca-Lá pattern)
    const existing = await this.listPaymentsByExternalReference(
      params.externalReference,
      { userId: params.userId, subscriptionId: params.subscriptionId },
    );
    if (existing.length > 0 && existing[0].id) {
      return {
        paymentId: existing[0].id,
        invoiceUrl: existing[0].invoiceUrl ?? null,
      };
    }

    throw new AsaasIntegrationError(
      res.ok
        ? "Resposta inesperada do Asaas ao gerar cobrança avulsa."
        : res.error.message,
    );
  }

  async getPayment(
    providerPaymentId: string,
    ctx?: { userId?: string; subscriptionId?: string },
  ): Promise<AsaasPaymentDetails | null> {
    const res = await this.request<AsaasPaymentDetails>(
      "GET",
      `/v3/payments/${encodeURIComponent(providerPaymentId)}`,
      {
        processName: "AsaasClient.getPayment",
        userId: ctx?.userId,
        subscriptionId: ctx?.subscriptionId,
      },
    );
    return res.ok ? res.data : null;
  }

  async listPaymentsBySubscription(
    providerSubscriptionId: string,
    ctx?: { userId?: string; subscriptionId?: string },
  ): Promise<AsaasPaymentDetails[]> {
    const res = await this.request<{ data?: AsaasPaymentDetails[] }>(
      "GET",
      `/v3/payments?subscription=${encodeURIComponent(providerSubscriptionId)}`,
      {
        processName: "AsaasClient.listPaymentsBySubscription",
        userId: ctx?.userId,
        subscriptionId: ctx?.subscriptionId,
      },
    );
    return res.ok && Array.isArray(res.data.data) ? res.data.data : [];
  }

  async listPaymentsByExternalReference(
    externalReference: string,
    ctx?: { userId?: string; subscriptionId?: string },
  ): Promise<AsaasPaymentDetails[]> {
    const res = await this.request<{ data?: AsaasPaymentDetails[] }>(
      "GET",
      `/v3/payments?externalReference=${encodeURIComponent(externalReference)}`,
      {
        processName: "AsaasClient.listPaymentsByExternalReference",
        userId: ctx?.userId,
        subscriptionId: ctx?.subscriptionId,
        externalReference,
      },
    );
    return res.ok && Array.isArray(res.data.data) ? res.data.data : [];
  }

  async getSubscriptionDetails(
    providerSubscriptionId: string,
    ctx?: { userId?: string; subscriptionId?: string },
  ): Promise<AsaasSubscriptionDetails | null> {
    const res = await this.request<AsaasSubscriptionDetails>(
      "GET",
      `/v3/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
      {
        processName: "AsaasClient.getSubscriptionDetails",
        userId: ctx?.userId,
        subscriptionId: ctx?.subscriptionId,
      },
    );
    return res.ok ? res.data : null;
  }

  async updateSubscriptionValue(
    providerSubscriptionId: string,
    newMonthlyPriceInCents: number,
    description?: string,
    ctx?: { userId?: string; subscriptionId?: string },
  ): Promise<boolean> {
    const payload: Record<string, unknown> = {
      value: centsToReais(newMonthlyPriceInCents),
      updatePendingPayments: false,
    };
    if (description && description.trim() !== "") {
      payload.description = description;
    }

    const res = await this.request(
      "PUT",
      `/v3/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
      {
        processName: "AsaasClient.updateSubscriptionValue",
        userId: ctx?.userId,
        subscriptionId: ctx?.subscriptionId,
      },
      payload,
    );
    return res.ok;
  }

  async updatePaymentValue(
    providerPaymentId: string,
    newAmountInCents: number,
    ctx?: { userId?: string; subscriptionId?: string },
  ): Promise<boolean> {
    const res = await this.request(
      "PUT",
      `/v3/payments/${encodeURIComponent(providerPaymentId)}`,
      {
        processName: "AsaasClient.updatePaymentValue",
        userId: ctx?.userId,
        subscriptionId: ctx?.subscriptionId,
      },
      { value: centsToReais(newAmountInCents) },
    );
    return res.ok;
  }

  async cancelSubscription(
    providerSubscriptionId: string,
    ctx?: { userId?: string; subscriptionId?: string },
  ): Promise<boolean> {
    const res = await this.request(
      "DELETE",
      `/v3/subscriptions/${encodeURIComponent(providerSubscriptionId)}`,
      {
        processName: "AsaasClient.cancelSubscription",
        userId: ctx?.userId,
        subscriptionId: ctx?.subscriptionId,
      },
    );
    return res.ok;
  }

  async cancelOneTimePayment(
    providerPaymentId: string,
    ctx?: { userId?: string; subscriptionId?: string },
  ): Promise<boolean> {
    const res = await this.request(
      "DELETE",
      `/v3/payments/${encodeURIComponent(providerPaymentId)}`,
      {
        processName: "AsaasClient.cancelOneTimePayment",
        userId: ctx?.userId,
        subscriptionId: ctx?.subscriptionId,
      },
    );
    return res.ok;
  }

  async refundPayment(
    providerPaymentId: string,
    ctx?: { userId?: string; subscriptionId?: string },
  ): Promise<AsaasRefundResult> {
    const res = await this.request<Record<string, unknown>>(
      "POST",
      `/v3/payments/${encodeURIComponent(providerPaymentId)}/refund`,
      {
        processName: "AsaasClient.refundPayment",
        userId: ctx?.userId,
        subscriptionId: ctx?.subscriptionId,
      },
      {},
    );

    if (!res.ok) {
      let parsedBody: Record<string, unknown> | null = null;
      if (res.rawBody) {
        try {
          parsedBody = JSON.parse(res.rawBody) as Record<string, unknown>;
        } catch {
          parsedBody = { raw: res.rawBody };
        }
      }
      return {
        success: false,
        refundId: null,
        status: "FAILED",
        rawPayload: parsedBody ?? { error: res.error.message },
      };
    }

    const status =
      typeof res.data.status === "string" ? res.data.status : "PROCESSING";
    return {
      success: true,
      refundId: typeof res.data.id === "string" ? res.data.id : null,
      status,
      rawPayload: res.data,
    };
  }
}
