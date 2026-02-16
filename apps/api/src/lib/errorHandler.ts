import { NextResponse } from "next/server";
import { fail } from "./api/respond";
import { isApiRouteError } from "./errors/apiRouteError";
import { logApiError } from "./errors/errorLogger";
import { ZodError } from "zod";

/**
 * Centralized API error handler.
 * Logs full error stack + context + meta, returns disciplined HTTP status.
 * Never throws.
 */
export function handleApiError(
  err: unknown,
  context: string,
  meta?: Record<string, unknown>,
): NextResponse {
  logApiError({ context, err, meta });

  // First-class typed errors thrown intentionally by routes/services.
  if (isApiRouteError(err)) {
    const status = err.status;
    if (status >= 400 && status <= 599) return fail(status, err.code);
    return fail(500, "internal_error");
  }

  // Zod validation errors: client input issue.
  if (err instanceof ZodError) {
    return fail(400, "invalid_input");
  }

  // Invalid/missing JSON body (common for route handlers).
  if (err instanceof SyntaxError && /json/i.test(err.message)) {
    return fail(400, "invalid_json");
  }

  // Upstream fetch wrappers sometimes throw { status }.
  const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : null;
  if (status && status >= 400 && status <= 599) {
    const code = typeof (err as any)?.code === "string" ? String((err as any).code) : "upstream_error";
    return fail(status, code);
  }

  return fail(500, "internal_error");
}

