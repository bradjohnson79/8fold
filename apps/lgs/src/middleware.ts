import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "lgs_auth";

function isPublicRoute(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/api/login" || pathname === "/api/logout") return true;
  // Legacy auth proxy routes — still accessible but auth-gated separately
  if (pathname.startsWith("/api/lgs/auth/")) return true;
  return false;
}

export default function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (isPublicRoute(pathname)) return NextResponse.next();

  const auth = req.cookies.get(AUTH_COOKIE)?.value?.trim();

  if (!auth) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } },
        { status: 401 },
      );
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
