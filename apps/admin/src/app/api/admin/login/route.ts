import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

const ADMIN_SESSION_COOKIE_NAME = "admin_session";

/**
 * Admin login — minimal straight-line auth.
 * Accepts form POST, calls API for validation, sets cookie, returns 302 redirect.
 * No fetch from client. No JSON + redirect mix. Pure HTTP.
 */
export async function POST(req: Request) {
  const apiOrigin = getValidatedApiOrigin();
  const url = `${apiOrigin}/api/admin/login`;

  const formData = await req.formData().catch(() => null);
  const email = String(formData?.get("email") ?? "").trim().toLowerCase();
  const password = String(formData?.get("password") ?? "");
  const next = String(formData?.get("next") ?? "").trim() || "/";
  const redirectPath = next.startsWith("/") ? next : "/";

  if (!email || !password) {
    const failUrl = new URL("/login", req.url);
    failUrl.searchParams.set("error", "invalid");
    if (redirectPath !== "/") failUrl.searchParams.set("next", redirectPath);
    return NextResponse.redirect(failUrl);
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-proxy": "true" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  const json = (await resp.json().catch(() => null)) as {
    ok?: boolean;
    data?: { sessionToken?: string; expiresAt?: string };
  } | null;

  if (resp.status !== 200 || !json?.ok || !json.data?.sessionToken || !json.data?.expiresAt) {
    const failUrl = new URL("/login", req.url);
    failUrl.searchParams.set("error", "invalid");
    if (redirectPath !== "/") failUrl.searchParams.set("next", redirectPath);
    return NextResponse.redirect(failUrl);
  }

  const res = NextResponse.redirect(new URL(redirectPath, req.url), 302);
  res.cookies.set(ADMIN_SESSION_COOKIE_NAME, json.data.sessionToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(json.data.expiresAt),
    ...(process.env.NODE_ENV === "production" && { domain: ".8fold.app" }),
  });
  return res;
}
