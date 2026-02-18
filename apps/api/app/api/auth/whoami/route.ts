import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { AuthErrorCodes } from "@/src/auth/errors/authErrorCodes";
import { authErrorResponse, getOrCreateRequestId, withRequestIdHeader } from "@/src/auth/errors/authErrorResponse";
import { db } from "@/server/db/drizzle";
import { users } from "@/db/schema/user";

function isWhoamiEnabled(): boolean {
  if (process.env.AUTH_DEBUG === "1") return true;
  return process.env.NODE_ENV !== "production";
}

function getBearerToken(req: Request): string | null {
  const raw = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (!v.toLowerCase().startsWith("bearer ")) return null;
  const token = v.slice(7).trim();
  return token ? token : null;
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function normalizeIssuer(v: string): string {
  return stripTrailingSlash(String(v ?? "").trim()).toLowerCase();
}

export async function GET(req: Request) {
  const requestId = getOrCreateRequestId(req);
  if (!isWhoamiEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const token = getBearerToken(req);
  if (!token) {
    return authErrorResponse(req, { status: 401, code: AuthErrorCodes.AUTH_MISSING_TOKEN, requestId });
  }

  // Dev-only diagnostic endpoint: verify JWT locally and expose a safe subset of claims.
  // This intentionally does NOT depend on `requireAuth()` so you can diagnose issuer
  // mismatches/config before the full auth boundary accepts the token.
  const jwtKey = String(process.env.CLERK_JWT_KEY ?? "").trim() || undefined;
  const secretKey = String(process.env.CLERK_SECRET_KEY ?? "").trim() || undefined;
  if (!jwtKey && !secretKey) {
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
    verified = await verifyToken(token, {
      ...(jwtKey ? { jwtKey } : {}),
      ...(secretKey ? { secretKey } : {}),
    } as any);
  } catch (err) {
    const msg = String((err as any)?.message ?? err ?? "");
    return authErrorResponse(req, {
      status: 401,
      code: AuthErrorCodes.AUTH_INVALID_TOKEN,
      requestId,
      details: { reason: msg.slice(0, 300) },
    });
  }

  const clerkUserId = verified?.sub ? String(verified.sub) : null;
  const internal =
    clerkUserId
      ? await db
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.clerkUserId, clerkUserId))
          .limit(2)
          .then((rows) => (rows.length === 1 ? rows[0]! : null))
          .catch(() => null)
      : null;

  const resp = NextResponse.json({
    ok: true,
    data: {
      expectedIssuer: process.env.CLERK_ISSUER ? normalizeIssuer(String(process.env.CLERK_ISSUER)) : null,
      observedIssuer: verified?.iss ? normalizeIssuer(String(verified.iss)) : null,
      clerkUserId,
      internalUserId: internal?.id ?? null,
      role: internal?.role ?? null,
      claims: {
        sub: verified?.sub,
        iss: verified?.iss,
        aud: verified?.aud,
        exp: verified?.exp,
        iat: verified?.iat,
        nbf: verified?.nbf,
        azp: verified?.azp,
        sid: verified?.sid,
      },
    },
    requestId,
  });
  return withRequestIdHeader(resp, requestId);
}

