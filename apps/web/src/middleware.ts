import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

function unauthenticatedApi() {
  return NextResponse.json({ ok: false, error: "Unauthorized", code: "UNAUTHENTICATED" }, { status: 401 });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtectedApp = pathname.startsWith("/app");
  const isProtectedApi = pathname.startsWith("/api/app");
  if (!isProtectedApp && !isProtectedApi) return NextResponse.next();

  // Guardrail: this read-only endpoint must never surface as 401/502 to the client.
  // Let the route handler degrade safely to { jobs: [] }.
  if (pathname === "/api/app/router/routable-jobs") return NextResponse.next();
  // Guardrail: session/bootstrap endpoint should control its own 401 response shape.
  if (pathname === "/api/app/me") return NextResponse.next();
  // Health should be callable without a session (smoke test anchor).
  if (pathname === "/api/app/system/health") return NextResponse.next();

  // Rome session cookie (DB-backed). Middleware can't validate in edge, but can enforce presence.
  const sid = req.cookies.get("sid")?.value ?? null;
  if (!sid) {
    return isProtectedApi ? unauthenticatedApi() : redirectToLogin(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/api/app/:path*"]
};

