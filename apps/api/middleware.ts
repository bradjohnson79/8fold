import { NextResponse } from "next/server";
import { logBootConfigOnce } from "./src/server/bootConfig";

logBootConfigOnce();

// Admin UI is served from apps/web (default local dev port 3006).
// This middleware only applies to direct /api/admin/* calls to apps/api.
const ADMIN_ORIGIN = String(process.env.ADMIN_ORIGIN ?? "").trim().replace(/\/+$/, "");

export function middleware(req: Request) {
  const url = new URL(req.url);
  const isAdminApi = url.pathname.startsWith("/api/admin/");

  if (!isAdminApi) {
    // No global auth. Routes enforce session+role server-side where required.
    return NextResponse.next();
  }

  // CORS: allow admin origin without credentials (browser should not call API directly,
  // but when it does we still want deterministic preflight + 401 behavior).
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = origin === ADMIN_ORIGIN ? ADMIN_ORIGIN : ADMIN_ORIGIN;

  function withCors(resp: Response): Response {
    resp.headers.set("Access-Control-Allow-Origin", allowOrigin);
    resp.headers.set("Vary", "Origin");
    return resp;
  }

  if (req.method.toUpperCase() === "OPTIONS") {
    const resp = new NextResponse(null, { status: 204 });
    resp.headers.set("Access-Control-Allow-Origin", allowOrigin);
    resp.headers.set("Vary", "Origin");
    resp.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    resp.headers.set(
      "Access-Control-Allow-Headers",
      "content-type,x-admin-id,x-admin-role,x-internal-secret,x-admin-trace-id",
    );
    // Do NOT set Access-Control-Allow-Credentials (no cookies).
    return resp;
  }

  // Public admin auth endpoints: login, logout, signup. No internal headers required.
  // These endpoints handle their own validation and return 401/403 as needed.
  const publicAdminPaths = ["/api/admin/login", "/api/admin/logout", "/api/admin/signup"];
  if (publicAdminPaths.includes(url.pathname)) {
    return withCors(NextResponse.next());
  }

  function cookieValueFromHeader(cookieHeader: string | null, name: string): string {
    const raw = cookieHeader ?? "";
    if (!raw) return "";
    for (const part of raw.split(";")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const k = part.slice(0, idx).trim();
      if (k !== name) continue;
      return part.slice(idx + 1).trim();
    }
    return "";
  }

  // Cookie-auth admin UI: if an `admin_session` cookie is present, let the route handler
  // verify it in the DB (edge middleware must not query DB).
  const adminSessionCookie = cookieValueFromHeader(req.headers.get("cookie"), "admin_session");
  if (adminSessionCookie) {
    return withCors(NextResponse.next());
  }

  // Internal-header admin access (server-to-server). Keep for scripts and non-cookie clients.
  // Note: middleware runs in the edge runtime; do not query the DB here.
  const expectedSecret = (process.env.INTERNAL_SECRET ?? "").trim();
  const providedSecret = String(req.headers.get("x-internal-secret") ?? "").trim();
  const adminId = String(req.headers.get("x-admin-id") ?? "").trim();
  const role = String(req.headers.get("x-admin-role") ?? "").trim().toUpperCase();

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const hasSession = Boolean(expectedSecret && providedSecret && providedSecret === expectedSecret && uuidRe.test(adminId));

  if (!hasSession) {
    return withCors(
      NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    );
  }

  const isAdminRole = role === "ADMIN";
  if (!isAdminRole) {
    return withCors(
      NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    );
  }

  return withCors(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/api/(.*)"]
};

