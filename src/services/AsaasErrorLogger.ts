import { prisma } from "../lib/db.js";

export interface AsaasErrorLogInput {
  processName: string;
  error: unknown;
  httpStatus?: number | null;
  requestMethod?: string | null;
  requestPath?: string | null;
  responseBody?: string | null;
  userId?: string | null;
  subscriptionId?: string | null;
  externalReference?: string | null;
}

const SENSITIVE_PATTERN =
  /(\$aact_(?:hmlg|prod)_[A-Za-z0-9+/=_-]+|access_token["']?\s*[:=]\s*["']?[^"'\s,}]+)/gi;

function sanitizeText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  const cleaned = value.replace(SENSITIVE_PATTERN, "[REDACTED]");
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 3)}...`;
}

/**
 * Persists only errors from Asaas API calls, webhooks, and billing reconciliation
 * into `asaas_error_logs`. Never throws so primary error handling is never masked.
 */
export async function logAsaasError(input: AsaasErrorLogInput): Promise<void> {
  try {
    const err = input.error;
    const errorType =
      err instanceof Error ? err.name || err.constructor?.name || "Error" : typeof err;
    const rawMessage =
      err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
    const shortMessage = sanitizeText(rawMessage || "Unknown Asaas error", 1000) ?? "Unknown Asaas error";
    const detailedStacktrace =
      err instanceof Error && err.stack ? sanitizeText(err.stack, 8000) : null;
    const responseBody = sanitizeText(input.responseBody, 4000);

    await prisma.asaasErrorLog.create({
      data: {
        processName: input.processName.slice(0, 200),
        errorType: errorType.slice(0, 120),
        httpStatus: input.httpStatus ?? null,
        shortMessage,
        detailedStacktrace,
        requestMethod: input.requestMethod ? input.requestMethod.slice(0, 16) : null,
        requestPath: input.requestPath ? input.requestPath.slice(0, 255) : null,
        responseBody,
        userId: input.userId ?? null,
        subscriptionId: input.subscriptionId ?? null,
        externalReference: input.externalReference ?? null,
      },
    });
  } catch (logFailure) {
    console.error("[AsaasErrorLogger] Failed to persist Asaas error log:", logFailure);
  }
}
