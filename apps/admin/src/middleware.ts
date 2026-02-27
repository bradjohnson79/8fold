import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/login(.*)", "/403(.*)", "/admin-signup(.*)"]);

const hasClerkEnv =
  Boolean(String(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").trim()) &&
  Boolean(String(process.env.CLERK_SECRET_KEY ?? "").trim());

function redirectToLogin(req: NextRequest): NextResponse {
  const signInUrl = new URL("/login", req.url);
  signInUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
}

const clerkHandler = clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;

  // Route handlers should return JSON status codes rather than middleware redirects.
  if (pathname.startsWith("/api/")) return;
  if (isPublicRoute(req)) return;

  const { userId } = await auth();
  if (!userId) {
    return redirectToLogin(req);
  }
});

export default async function middleware(req: NextRequest, ev: Parameters<typeof clerkHandler>[1]) {
  const pathname = req.nextUrl.pathname;

  if (!hasClerkEnv) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "ADMIN_AUTH_UNAVAILABLE", message: "Authentication is not configured." } },
        { status: 503 },
      );
    }
    if (isPublicRoute(req)) return NextResponse.next();
    return redirectToLogin(req);
  }

  try {
    return await clerkHandler(req, ev);
  } catch (error) {
    console.error("[ADMIN_MIDDLEWARE_ERROR]", {
      pathname,
      message: error instanceof Error ? error.message : String(error),
    });

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "ADMIN_AUTH_ERROR", message: "Authentication check failed." } },
        { status: 401 },
      );
    }
    if (isPublicRoute(req)) return NextResponse.next();
    return redirectToLogin(req);
  }
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
