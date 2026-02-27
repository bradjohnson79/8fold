import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { routers } from "@/db/schema/router";
import { requireRole } from "../../auth/requireRole";
import { AuthErrorCodes } from "../../auth/errors/authErrorCodes";
import { authErrorResponse, getOrCreateRequestId } from "../../auth/errors/authErrorResponse";
import { authenticateAdminRequest } from "./adminSessionAuth";

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

export async function requireAdmin(req: Request): Promise<NextResponse | RequireAdminOk> {
  try {
    const admin = await authenticateAdminRequest(req);
    if (admin instanceof Response) return admin;
    return { userId: admin.adminId, role: "ADMIN" };
  } catch (err) {
    console.error("[ADMIN_AUTH_GUARD_ERROR]", {
      route: safePath(req.url),
      method: req.method,
      error: err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function requireAdminOrRouter(req: Request): Promise<NextResponse | RequireAdminOrRouterOk> {
  try {
    const adminResult = await requireAdmin(req);
    if (!(adminResult instanceof NextResponse)) return adminResult;

    const routerAuthed = await requireRole(req, "ROUTER");
    if (routerAuthed instanceof Response) return routerAuthed as NextResponse;
    const user = { userId: routerAuthed.internalUser.id, role: "ROUTER" as const };

    return { userId: user.userId, role: "ROUTER" };
  } catch (err) {
    console.error("[ADMIN_OR_ROUTER_GUARD_ERROR]", {
      route: safePath(req.url),
      method: req.method,
      error: err,
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

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
    const r = await routersToSenior(req, routerAuthed.internalUser.id);
    if (r instanceof NextResponse) return r;
    return { user: { userId: routerAuthed.internalUser.id, role: "ROUTER" }, isAdmin: false };
  } catch (err) {
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
