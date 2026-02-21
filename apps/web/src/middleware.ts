import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * AUTHORITY RULE:
 * Clerk is the sole source of authentication state.
 * No DB, cookie, or internal API logic may determine login state.
 */

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/api/public(.*)",
  "/api/webhooks(.*)",
  "/api/stripe/webhook(.*)",
  "/admin/login(.*)",
]);

const isProtectedRoute = createRouteMatcher([
  "/app(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req) && !isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};

