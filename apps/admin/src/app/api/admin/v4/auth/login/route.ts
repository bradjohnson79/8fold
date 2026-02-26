import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";
import { ADMIN_SESSION_COOKIE_NAME } from "@/server/adminSession";

function setAdminSessionCookie(res: NextResponse, token: string, expiresAtRaw?: string): void {
  const secure = process.env.NODE_ENV === "production";
  const expiresAt = new Date(String(expiresAtRaw || ""));
  const parts = [
    `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${(Number.isNaN(expiresAt.getTime()) ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : expiresAt).toUTCString()}`,
    secure ? "Secure" : null,
  ].filter(Boolean);
  res.headers.append("set-cookie", parts.join("; "));
}

export async function POST(req: Request) {
  const apiOrigin = getValidatedApiOrigin();
  const url = `${apiOrigin}/api/admin/v4/auth/login`;

  const formData = await req.formData().catch(() => null);
  const email = String(formData?.get("email") ?? "").trim().toLowerCase();
  const password = String(formData?.get("password") ?? "");
  const next = String(formData?.get("next") ?? "").trim() || "/";
  const redirectPath = next.startsWith("/") ? next : "/";

  if (!email || !password) {
    const failUrl = new URL("/login", req.url);
    failUrl.searchParams.set("error", "invalid");
    if (redirectPath !== "/") failUrl.searchParams.set("next", redirectPath);
    return NextResponse.redirect(failUrl, 302);
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-proxy": "true" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  const json = (await resp.json().catch(() => null)) as { ok?: boolean; data?: { sessionToken?: string; expiresAt?: string } } | null;
  if (!resp.ok || !json?.ok) {
    const failUrl = new URL("/login", req.url);
    failUrl.searchParams.set("error", "invalid");
    if (redirectPath !== "/") failUrl.searchParams.set("next", redirectPath);
    return NextResponse.redirect(failUrl, 302);
  }

  const out = NextResponse.redirect(new URL(redirectPath, req.url), 302);
  const sessionToken = String(json?.data?.sessionToken ?? "").trim();
  if (sessionToken) {
    setAdminSessionCookie(out, sessionToken, json?.data?.expiresAt);
  } else {
    const setCookie = resp.headers.get("set-cookie");
    if (setCookie) out.headers.set("set-cookie", setCookie);
  }
  return out;
}
