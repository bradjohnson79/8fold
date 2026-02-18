import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { routers } from "@/db/schema/router";
import { adminSessionTokenFromRequest, getAdminIdentityBySessionToken } from "@/src/lib/auth/adminSession";
import { requireRole } from "../../auth/requireRole";
import { AuthErrorCodes } from "../../auth/errors/authErrorCodes";
import { authErrorResponse, getOrCreateRequestId } from "../../auth/errors/authErrorResponse";

export type RequireAdminOk = {
  userId: string;
  role: "ADMIN";
};

export type RequireAdminOrRouterOk = {
  userId: string;
  role: "ADMIN" | "ROUTER";
};

export type RequireAdminOrSeniorRouterOk = {
  user: { userId: string; role: string };
  isAdmin: boolean;
};

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Centralized admin auth guard for apps/api admin routes.
 *
 * Contract:
 * - Returns NextResponse JSON on failure (never throws)
 * - Returns { userId } on success
 */
export async function requireAdmin(req: Request): Promise<NextResponse | RequireAdminOk> {
  try {
    // Preferred: admin_session cookie (AdminUser table), used by apps/admin.
    const sessionToken = adminSessionTokenFromRequest(req);
    if (sessionToken) {
      const admin = await getAdminIdentityBySessionToken(sessionToken).catch(() => null);
      const role = String(admin?.role ?? "").trim().toUpperCase();
      if (admin?.id && role === "ADMIN") return { userId: String(admin.id), role: "ADMIN" };
    }

    // Clerk is the sole identity authority. ADMIN role is DB-authoritative.
    const authed = await requireRole(req, "ADMIN");
    if (authed instanceof Response) return authed as NextResponse;
    return { userId: authed.internalUser.id, role: "ADMIN" };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ADMIN_AUTH_GUARD_ERROR]", {
      route: safePath(req.url),
      method: req.method,
      error: err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

/**
 * Admin or Router only. Returns NextResponse on failure (never throws).
 * Used for routes like POST /api/admin/jobs/:id/assign where routers can also assign.
 */
export async function requireAdminOrRouter(req: Request): Promise<NextResponse | RequireAdminOrRouterOk> {
  try {
    const adminResult = await requireAdmin(req);
    if (!(adminResult instanceof NextResponse)) return adminResult;

    const routerAuthed = await requireRole(req, "ROUTER");
    if (routerAuthed instanceof Response) return routerAuthed as NextResponse;
    const user = { userId: routerAuthed.internalUser.id, role: "ROUTER" as const };

    return { userId: user.userId, role: "ROUTER" };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ADMIN_OR_ROUTER_GUARD_ERROR]", {
      route: safePath(req.url),
      method: req.method,
      error: err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

/**
 * Admin or Senior Router guard for support routes.
 * Tries admin first; if not admin, tries Senior Router (session-based).
 * Returns NextResponse on failure (never throws).
 */
export async function requireAdminOrSeniorRouter(
  req: Request,
): Promise<NextResponse | RequireAdminOrSeniorRouterOk> {
  try {
    const admin = await requireAdmin(req);
    if (!(admin instanceof NextResponse)) {
      return { user: { userId: admin.userId, role: admin.role }, isAdmin: true };
    }
    const routerAuthed = await requireRole(req, "ROUTER");
    if (routerAuthed instanceof Response) return routerAuthed as NextResponse;
    // Senior router determination remains DB-authoritative (routers.isSeniorRouter).
    // If non-senior, behave like forbidden (admin response already contains proper error envelope).
    const r = await routersToSenior(req, routerAuthed.internalUser.id);
    if (r instanceof NextResponse) return r;
    return { user: { userId: routerAuthed.internalUser.id, role: "ROUTER" }, isAdmin: false };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ADMIN_OR_SENIOR_ROUTER_GUARD_ERROR]", {
      route: safePath(req.url),
      method: req.method,
      error: err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

async function routersToSenior(req: Request, userId: string): Promise<NextResponse | true> {
  const requestId = getOrCreateRequestId(req);
  const routerRows = await db
    .select({ isSeniorRouter: routers.isSeniorRouter, status: routers.status })
    .from(routers)
    .where(eq(routers.userId, userId))
    .limit(1);
  const router = routerRows[0] ?? null;
  if (!router || router.status !== "ACTIVE" || !router.isSeniorRouter) {
    return authErrorResponse(req, {
      status: 403,
      code: AuthErrorCodes.ROLE_MISMATCH,
      requestId,
      details: { expectedRole: "SENIOR_ROUTER" },
    });
  }
  return true;
}

