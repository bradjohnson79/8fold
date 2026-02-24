/**
 * Structured API error logger.
 * Production-safe: no secrets, no stack in production.
 */
function redact(str: string): string {
  const lower = str.toLowerCase();
  if (
    lower.includes("token") ||
    lower.includes("secret") ||
    lower.includes("password") ||
    lower.includes("authorization") ||
    lower.includes("cookie")
  ) {
    return "[REDACTED]";
  }
  return str;
}

export type LogApiErrorMeta = {
  requestId?: string;
  path?: string;
  method?: string;
};

export function logApiError(err: unknown, meta: LogApiErrorMeta): void {
  const e = err as { code?: string; status?: number; message?: string };
  const isProd = process.env.NODE_ENV === "production";

  const payload: Record<string, unknown> = {
    tag: "API_ERROR",
    requestId: meta.requestId,
    method: meta.method,
    path: meta.path,
    code: e.code ?? null,
    status: e.status ?? null,
    message: e.message ? redact(String(e.message)) : null,
  };

  if (!isProd && err instanceof Error && err.stack) {
    payload.stack = redact(err.stack);
  }

  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload));
}
