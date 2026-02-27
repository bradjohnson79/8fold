import { NextResponse } from "next/server";
import { getAdminOrigin, getWebOrigin, logBootConfigOnce } from "./src/server/bootConfig";

logBootConfigOnce();

// Admin UI is served from the configured admin origin.
// This middleware only applies to direct /api/admin/* calls to apps/api.
const ADMIN_ORIGIN = getAdminOrigin();
const WEB_ORIGIN = getWebOrigin();

export function middleware(req: Request) {
  const url = new URL(req.url);
  const isAdminApi = url.pathname.startsWith("/api/admin/");
  const isWebApi = url.pathname.startsWith("/api/web/");
  const isJobApi = url.pathname.startsWith("/api/job/");
  const isJobDraftApi = url.pathname.startsWith("/api/job-draft/");
  const isBrowserApi = isWebApi || isJobApi || isJobDraftApi;

  if (!isAdminApi && !isBrowserApi) {
    // No global auth. Routes enforce session+role server-side where required.
    return NextResponse.next();
  }

  // CORS:
  // - /api/admin/* is called by admin app origin.
  // - /api/web/* may be called directly by web browser clients at WEB_ORIGIN.
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = isAdminApi
    ? ADMIN_ORIGIN
    : origin === WEB_ORIGIN
      ? WEB_ORIGIN
      : WEB_ORIGIN;

  function withCors(resp: Response): Response {
    resp.headers.set("Access-Control-Allow-Origin", allowOrigin);
    resp.headers.set("Vary", "Origin");
    resp.headers.set("Access-Control-Allow-Credentials", "true");
    return resp;
  }

  if (req.method.toUpperCase() === "OPTIONS") {
    const resp = new NextResponse(null, { status: 204 });
    resp.headers.set("Access-Control-Allow-Origin", allowOrigin);
    resp.headers.set("Vary", "Origin");
    resp.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    resp.headers.set("Access-Control-Allow-Headers", "content-type,authorization,x-admin-trace-id,x-requested-with");
    resp.headers.set("Access-Control-Allow-Credentials", "true");
    return resp;
  }

  // Auth is enforced in route guards (requireAdminV4 / requireAdmin / requireAdminClerk).
  return withCors(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/api/(.*)"],
};
