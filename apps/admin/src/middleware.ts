import { NextRequest, NextResponse } from "next/server";

const ADMIN_SESSION_COOKIE = "admin_session";
const EIGHT_HOURS_SECONDS = 60 * 60 * 8;

function isPublicRoute(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/admin-signup" || pathname.startsWith("/admin-signup/")) return true;
  if (pathname.startsWith("/api/admin/auth/")) return true;
  return false;
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function verifyHs256(token: string, secret: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, signatureB64] = parts;
    if (!headerB64 || !payloadB64 || !signatureB64) return false;

    const headerJson = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/"))) as {
      alg?: string;
      typ?: string;
    };
    if (headerJson.alg !== "HS256") return false;

    const payloadJson = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
    };
    if (typeof payloadJson.exp !== "number") return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payloadJson.exp <= nowSeconds) return false;
    if (payloadJson.exp > nowSeconds + EIGHT_HOURS_SECONDS + 60) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
    const expected = toBase64Url(new Uint8Array(signed));
    return timingSafeEqual(expected, signatureB64);
  } catch {
    return false;
  }
}

export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (isPublicRoute(pathname)) return NextResponse.next();

  const secret = String(process.env.ADMIN_JWT_SECRET ?? "").trim();
  if (!secret) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "ADMIN_AUTH_UNAVAILABLE", message: "Authentication is not configured." } },
        { status: 503 },
      );
    }
    return redirectToLogin(req);
  }

  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value?.trim() ?? "";
  if (!token || !(await verifyHs256(token, secret))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } },
        { status: 401 },
      );
    }
    return redirectToLogin(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
