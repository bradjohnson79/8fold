import { NextResponse } from "next/server";
import { getAdminOrigin, getWebOrigin, logBootConfigOnce } from "./src/server/bootConfig";

// Health endpoints bypass middleware entirely (no boot config, no CORS).
// Use for diagnostics: if these fail, domain/root/matcher may be wrong.
const HEALTH_PATHS = ["/healthz", "/api/health/noop"];

export function middleware(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;
  if (HEALTH_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  logBootConfigOnce();
  const ADMIN_ORIGIN = getAdminOrigin();
  const WEB_ORIGIN = getWebOrigin();

  const isAdminApi = path.startsWith("/api/admin/");
  const isWebApi = url.pathname.startsWith("/api/web/");
  const isJobApi = path.startsWith("/api/job/");
  const isJobDraftApi = path.startsWith("/api/job-draft/");
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
    resp.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
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
