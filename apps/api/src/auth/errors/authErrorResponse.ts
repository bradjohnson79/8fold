import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { AuthErrorCodes, type AuthErrorCode } from "./authErrorCodes";

export type AuthErrorEnvelope = {
  ok: false;
  error: {
    code: AuthErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
};

export function getOrCreateRequestId(req: Request): string {
  const incoming = req.headers.get("x-request-id") ?? req.headers.get("X-Request-Id");
  const v = String(incoming ?? "").trim();
  return v || crypto.randomUUID();
}

export function withRequestIdHeader(resp: NextResponse, requestId: string): NextResponse {
  resp.headers.set("X-Request-Id", requestId);
  return resp;
}

function safeAuthMessage(code: AuthErrorCode): string {
  // Production-safe, non-sensitive user-facing messages.
  switch (code) {
    case AuthErrorCodes.AUTH_CONFIG_MISSING:
      return "Auth configuration missing";
    case AuthErrorCodes.AUTH_MISSING_TOKEN:
      return "Missing auth token";
    case AuthErrorCodes.AUTH_EXPIRED_TOKEN:
      return "Auth token expired";
    case AuthErrorCodes.AUTH_INVALID_TOKEN:
    case AuthErrorCodes.AUTH_CLERK_VERIFICATION_FAILED:
      return "Auth token invalid";
    case AuthErrorCodes.AUTH_INVALID_ISSUER:
      return "Token issuer mismatch";
    case AuthErrorCodes.AUTH_INVALID_AUDIENCE:
      return "Invalid token audience";
    case AuthErrorCodes.USER_ROLE_NOT_ASSIGNED:
      return "User must select a role before continuing";
    case AuthErrorCodes.USER_DUPLICATE_MAPPING:
      return "Duplicate identity mapping detected";
    case AuthErrorCodes.ROLE_IMMUTABLE:
      return "Role selection is permanent and cannot be changed.";
    case AuthErrorCodes.ROLE_MISMATCH:
    case AuthErrorCodes.ROLE_NOT_PERMITTED:
    case AuthErrorCodes.ADMIN_REQUIRED:
      return "Not authorized";
    case AuthErrorCodes.USER_SOFT_DELETED:
      return "User is not active";
    case AuthErrorCodes.USER_NOT_FOUND:
    default:
      return "User not found";
  }
}

export function authErrorResponse(req: Request, opts: {
  status: 400 | 401 | 403 | 409 | 500 | 503;
  code: AuthErrorCode;
  details?: Record<string, unknown>;
  message?: string;
  requestId?: string;
}): NextResponse {
  const requestId = opts.requestId ?? getOrCreateRequestId(req);
  const isDev = process.env.NODE_ENV !== "production";

  // Message overrides are allowed in production *only* when they are safe
  // (no tokens, cookies, secrets). Details remain dev-only.
  const message = String(opts.message ?? safeAuthMessage(opts.code));

  const body: AuthErrorEnvelope = {
    ok: false,
    error: {
      code: opts.code,
      message,
      ...(isDev && opts.details ? { details: opts.details } : {}),
    },
    requestId,
  };

  const resp = NextResponse.json(body, { status: opts.status });
  return withRequestIdHeader(resp, requestId);
}

export function logAuthFailure(req: Request, info: {
  level: "warn" | "error";
  event: string;
  code: AuthErrorCode;
  requestId: string;
  clerkUserId?: string | null;
  internalUserId?: string | null;
  role?: string | null;
  requiredRole?: string | null;
  details?: Record<string, unknown>;
}): void {
  // Do not log raw tokens/cookies/bodies.
  const route = (() => {
    try {
      return new URL(req.url).pathname;
    } catch {
      return req.url;
    }
  })();

  // eslint-disable-next-line no-console
  console.error("[AUTH]", {
    level: info.level,
    event: info.event,
    code: info.code,
    route,
    method: req.method,
    requestId: info.requestId,
    clerkUserId: info.clerkUserId ?? undefined,
    internalUserId: info.internalUserId ?? undefined,
    role: info.role ?? undefined,
    requiredRole: info.requiredRole ?? undefined,
    details: info.details ?? undefined,
  });
}
