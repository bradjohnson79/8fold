import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/admin-signup", "/403"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function middleware(req: any) {
  const pathname = String(req?.nextUrl?.pathname ?? "");

  // Never gate Next.js route handlers with redirects; route handlers should return JSON status codes.
  if (pathname.startsWith("/api/")) return;

  if (isPublicPath(pathname)) return;

  const token = String(req?.cookies?.get("admin_session")?.value ?? "").trim();
  const hasSession = Boolean(token);
  if (process.env.NODE_ENV !== "production") {
    // Dev-only: visibility into why /admin routes redirect (never log tokens/cookies).
    // eslint-disable-next-line no-console
    console.log("[ADMIN MIDDLEWARE]", { path: pathname, hasSession });
  }

  if (!hasSession) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

