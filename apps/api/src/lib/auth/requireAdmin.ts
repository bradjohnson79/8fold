import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { routers } from "@/db/schema/router";
import { routerProfiles } from "@/db/schema/routerProfile";
import { requireInternalAdmin, verifyInternalAdmin } from "../../server/requireInternalAdmin";
import { optionalUser } from "../../auth/rbac";
import { requireSeniorRouter } from "../../auth/rbac";
import { adminSessionTokenFromRequest, getAdminIdentityBySessionToken } from "./adminSession";

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
    // Preferred: browser/admin UI session via admin_session cookie.
    // Fallback: internal secret + admin id headers (service/admin scripts).
    const cookieToken = adminSessionTokenFromRequest(req);
    if (cookieToken) {
      const admin = await getAdminIdentityBySessionToken(cookieToken);
      if (!admin) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      return { userId: admin.id, role: "ADMIN" };
    }

    const base = requireInternalAdmin(req);
    if (!base) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const verified = await verifyInternalAdmin(req);
    if (!verified) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    return { userId: verified.adminId, role: "ADMIN" };
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

    const user = await optionalUser(req);
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (String(user.role) !== "ROUTER") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const profileRows = await db
      .select({ status: routerProfiles.status })
      .from(routerProfiles)
      .where(eq(routerProfiles.userId, user.userId))
      .limit(1);
    const profile = profileRows[0] ?? null;
    if (!profile || profile.status !== "ACTIVE") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const routerRows = await db
      .select({ status: routers.status })
      .from(routers)
      .where(eq(routers.userId, user.userId))
      .limit(1);
    const router = routerRows[0] ?? null;
    if (!router || router.status !== "ACTIVE") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

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
    try {
      const u = await requireSeniorRouter(req);
      return { user: u, isAdmin: false };
    } catch {
      return admin;
    }
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

