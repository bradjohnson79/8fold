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
    // eslint-disable-next-line no-console
    console.log("[ADMIN_LOGIN]", { ok: false, email, apiStatus: resp.status, hasToken: !!json?.data?.sessionToken });
    const failUrl = new URL("/login", req.url);
    failUrl.searchParams.set("error", "invalid");
    if (redirectPath !== "/") failUrl.searchParams.set("next", redirectPath);
    return NextResponse.redirect(failUrl);
  }

  const res = NextResponse.redirect(new URL(redirectPath, req.url), 302);
  const cookieOpts: Record<string, unknown> = {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(json.data.expiresAt),
  };
  // Omit domain — host-only cookie for admin.8fold.app is more reliable than domain=.8fold.app
  res.cookies.set(ADMIN_SESSION_COOKIE_NAME, json.data.sessionToken, cookieOpts);
  // eslint-disable-next-line no-console
  console.log("[ADMIN_LOGIN]", { ok: true, email, redirectPath, hasCookie: true });
  return res;
}
