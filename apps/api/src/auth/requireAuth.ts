import { eq } from "drizzle-orm";
import { verifyToken } from "@clerk/nextjs/server";
import { db } from "@/server/db/drizzle";
import { users } from "@/db/schema/user";
import { AuthErrorCodes } from "./errors/authErrorCodes";
import { authErrorResponse, getOrCreateRequestId, logAuthFailure } from "./errors/authErrorResponse";

export type RequireAuthOk = {
  requestId: string;
  clerkUserId: string;
  internalUser: { id: string; role: string | null; email: string | null; phone: string | null; status: string | null } | null;
  safeClaims?: Record<string, unknown>;
};

function getBearerToken(req: Request): string | null {
  const raw = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (!v.toLowerCase().startsWith("bearer ")) return null;
  const token = v.slice(7).trim();
  return token ? token : null;
}

function parseCommaList(v: string | null | undefined): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function normalizeIssuer(v: string): string {
  return stripTrailingSlash(String(v ?? "").trim()).toLowerCase();
}

/**
 * Decode JWT payload (claims only) without verification. Safe for diagnostic logging.
 * Returns iss and aud only; never logs the token or any secrets.
 */
function decodeJwtClaimsUnsafe(token: string): { iss?: string; aud?: string | string[] } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      iss: typeof parsed.iss === "string" ? parsed.iss : undefined,
      aud: parsed.aud as string | string[] | undefined,
    };
  } catch {
    return null;
  }
}

const API_AUTH_DEBUG = process.env.AUTH_DEBUG === "true";

function logAuth401Diagnostic(opts: {
  token: string;
  expectedIssuer: string;
  expectedAudience: string[];
  requestId: string;
  path: "verify_throw" | "issuer_mismatch";
  verifiedIssuer?: string;
  reason?: string;
}): void {
  if (!API_AUTH_DEBUG) return;
  const claims = decodeJwtClaimsUnsafe(opts.token);
  // eslint-disable-next-line no-console
  console.warn("[AUTH_401_DIAGNOSTIC]", {
    path: opts.path,
    requestId: opts.requestId,
    token_iss: claims?.iss ?? "(decode failed)",
    token_aud: claims?.aud ?? "(decode failed)",
    configured_CLERK_ISSUER: opts.expectedIssuer,
    configured_CLERK_AUDIENCE: opts.expectedAudience.length ? opts.expectedAudience : "(empty)",
    ...(opts.verifiedIssuer !== undefined && { verified_iss_after_normalize: opts.verifiedIssuer }),
    ...(opts.reason !== undefined && { reason: opts.reason }),
  });
}

export async function requireAuth(req: Request): Promise<RequireAuthOk | Response> {
  const requestId = getOrCreateRequestId(req);
  const token = getBearerToken(req);
  if (!token) {
    logAuthFailure(req, {
      level: "warn",
      event: "auth.missing_token",
      code: AuthErrorCodes.AUTH_MISSING_TOKEN,
      requestId,
    });
    return authErrorResponse(req, { status: 401, code: AuthErrorCodes.AUTH_MISSING_TOKEN, requestId });
  }

  const jwtKey = String(process.env.CLERK_JWT_KEY ?? "").trim() || undefined;
  const secretKey = String(process.env.CLERK_SECRET_KEY ?? "").trim() || undefined;
  const audience = parseCommaList(process.env.CLERK_AUDIENCE);
  const authorizedParties = parseCommaList(process.env.CLERK_AUTHORIZED_PARTIES);
  const expectedIssuerRaw = String(process.env.CLERK_ISSUER ?? "").trim();
  const expectedIssuer = normalizeIssuer(expectedIssuerRaw);
  const issuerAllowlist = parseCommaList(process.env.CLERK_ISSUER_ALLOWLIST).map(normalizeIssuer).filter(Boolean);

  if (!jwtKey && !secretKey) {
    logAuthFailure(req, {
      level: "error",
      event: "auth.config_missing",
      code: AuthErrorCodes.AUTH_CONFIG_MISSING,
      requestId,
      details: { missing: ["CLERK_JWT_KEY or CLERK_SECRET_KEY"] },
    });
    return authErrorResponse(req, {
      status: 500,
      code: AuthErrorCodes.AUTH_CONFIG_MISSING,
      message: "CLERK_JWT_KEY or CLERK_SECRET_KEY not configured",
      requestId,
      details: { missing: ["CLERK_JWT_KEY or CLERK_SECRET_KEY"] },
    });
  }

  let verified: any;
  try {
    // Clerk token verification is local (no REST calls). We optionally pass an `issuer`
    // hint for runtime validation if the SDK supports it. We still enforce issuer ourselves
    // using the `iss` claim to avoid relying on SDK behavior/types.
    // When allowlist is set, omit issuer from SDK so we can accept multiple issuers via manual check.
    const verifyOpts: any = {
      ...(jwtKey ? { jwtKey } : {}),
      ...(secretKey ? { secretKey } : {}),
      ...(audience.length ? { audience } : {}),
      ...(authorizedParties.length ? { authorizedParties } : {}),
      ...(expectedIssuer && issuerAllowlist.length === 0 ? { issuer: expectedIssuer } : {}),
    };
    verified = await verifyToken(token, verifyOpts);
  } catch (err) {
    const msg = String((err as any)?.message ?? err ?? "");
    const msgLower = msg.toLowerCase();
    const code =
      msgLower.includes("exp") || msgLower.includes("expired")
        ? AuthErrorCodes.AUTH_EXPIRED_TOKEN
        : msgLower.includes("issuer") || msgLower.includes("invalid iss") || msgLower.includes(" iss ") || msgLower.includes("iss=") || msgLower.includes("iss:")
          ? AuthErrorCodes.AUTH_INVALID_ISSUER
          : audience.length && (msgLower.includes("audience") || msgLower.includes(" aud ") || msgLower.includes("aud=") || msgLower.includes("aud:"))
            ? AuthErrorCodes.AUTH_INVALID_AUDIENCE
            : AuthErrorCodes.AUTH_INVALID_TOKEN;
    logAuth401Diagnostic({
      token,
      expectedIssuer,
      expectedAudience: audience,
      requestId,
      path: "verify_throw",
      reason: msg.slice(0, 300),
    });
    logAuthFailure(req, {
      level: "warn",
      event: "auth.token_verification_failed",
      code,
      requestId,
      details: { reason: msg.slice(0, 300) },
    });
    return authErrorResponse(req, {
      status: 401,
      code,
      requestId,
      message: code === AuthErrorCodes.AUTH_INVALID_ISSUER ? "Token issuer mismatch" : undefined,
      details: { reason: msg.slice(0, 300) },
    });
  }

  const clerkUserId = String(verified?.sub ?? "").trim();
  if (!clerkUserId) {
    logAuthFailure(req, {
      level: "warn",
      event: "auth.missing_subject",
      code: AuthErrorCodes.AUTH_INVALID_TOKEN,
      requestId,
    });
    return authErrorResponse(req, { status: 401, code: AuthErrorCodes.AUTH_INVALID_TOKEN, requestId });
  }

  const issuer = normalizeIssuer(String(verified?.iss ?? ""));
  if (!expectedIssuer) {
    // Fail closed: require explicit CLERK_ISSUER, but never return 503 for auth boundary
    // configuration issues (503 is reserved for infrastructure/service availability).
    logAuthFailure(req, {
      level: "error",
      event: "auth.config_missing",
      code: AuthErrorCodes.AUTH_CONFIG_MISSING,
      requestId,
      clerkUserId,
      details: { missing: ["CLERK_ISSUER"], observedIssuer: issuer || null },
    });
    return authErrorResponse(req, {
      status: 500,
      code: AuthErrorCodes.AUTH_CONFIG_MISSING,
      message: "CLERK_ISSUER not configured",
      requestId,
      details: { missing: ["CLERK_ISSUER"], observedIssuer: issuer || null },
    });
  }
  const allowedIssuers = [expectedIssuer, ...issuerAllowlist].filter(Boolean);
  const issuerAccepted = allowedIssuers.some((a) => issuer === a);
  if (!issuerAccepted) {
    logAuth401Diagnostic({
      token,
      expectedIssuer,
      expectedAudience: audience,
      requestId,
      path: "issuer_mismatch",
      verifiedIssuer: issuer,
      reason: `Token iss "${issuer}" not in allowed list`,
    });
    logAuthFailure(req, {
      level: "warn",
      event: "auth.invalid_issuer",
      code: AuthErrorCodes.AUTH_INVALID_ISSUER,
      requestId,
      clerkUserId,
      details: { iss: issuer, expected: expectedIssuer },
    });
    return authErrorResponse(req, {
      status: 401,
      code: AuthErrorCodes.AUTH_INVALID_ISSUER,
      message: "Token issuer mismatch",
      requestId,
      details: { iss: issuer, expected: expectedIssuer, allowlist: issuerAllowlist },
    });
  }

  // Identity mapping: always resolve internal user by clerkUserId (never email).
  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      email: users.email,
      phone: users.phone,
      status: users.status,
    })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(2);

  if (rows.length > 1) {
    logAuthFailure(req, {
      level: "error",
      event: "auth.duplicate_mapping",
      code: AuthErrorCodes.USER_DUPLICATE_MAPPING,
      requestId,
      clerkUserId,
      details: { count: rows.length },
    });
    return authErrorResponse(req, { status: 409, code: AuthErrorCodes.USER_DUPLICATE_MAPPING, requestId });
  }

  const internal = rows[0] ?? null;
  if (internal) {
    const status = String(internal.status ?? "ACTIVE").toUpperCase();
    if (status === "ARCHIVED" || status === "SUSPENDED") {
      logAuthFailure(req, {
        level: "warn",
        event: "auth.user_soft_deleted",
        code: AuthErrorCodes.USER_SOFT_DELETED,
        requestId,
        clerkUserId,
        internalUserId: internal.id,
        role: internal.role,
        details: { status },
      });
      return authErrorResponse(req, {
        status: 403,
        code: AuthErrorCodes.USER_SOFT_DELETED,
        requestId,
        details: { status },
      });
    }
  }

  return {
    requestId,
    clerkUserId,
    internalUser: internal,
    safeClaims: {
      sub: verified?.sub,
      iss: verified?.iss,
      aud: verified?.aud,
      exp: verified?.exp,
      iat: verified?.iat,
      nbf: verified?.nbf,
      azp: verified?.azp,
      sid: verified?.sid,
    },
  };
}
