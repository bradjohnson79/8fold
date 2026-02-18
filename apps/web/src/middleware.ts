import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/app(.*)",
  "/api/app(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    // Clerk handles redirects/rewrites internally for protected routes.
    // Do not return the auth object (not a NextMiddlewareResult).
    await auth.protect();
  }

  // Server Components (layouts/pages) don't get the pathname directly.
  // We pass it through so role/onboarding layouts can enforce hard redirects without loops.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  // Run on all routes except Next.js internals and static files.
  matcher: ["/((?!_next|.*\\..*).*)"],
};

