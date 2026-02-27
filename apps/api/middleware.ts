import { NextResponse } from "next/server";
import { getAdminOrigin, logBootConfigOnce } from "./src/server/bootConfig";

logBootConfigOnce();

// Admin UI is served from the configured admin origin.
// This middleware only applies to direct /api/admin/* calls to apps/api.
const ADMIN_ORIGIN = getAdminOrigin();

export function middleware(req: Request) {
  const url = new URL(req.url);
  const isAdminApi = url.pathname.startsWith("/api/admin/");

  if (!isAdminApi) {
    // No global auth. Routes enforce session+role server-side where required.
    return NextResponse.next();
  }

  // CORS: allow admin origin for admin control-plane traffic.
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
    resp.headers.set("Access-Control-Allow-Headers", "content-type,authorization,x-admin-trace-id");
    return resp;
  }

  // Auth is enforced in route guards (requireAdminV4 / requireAdmin / requireAdminClerk).
  return withCors(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/api/(.*)"],
};
