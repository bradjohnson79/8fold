import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

/**
 * Admin login — minimal straight-line auth.
 * Accepts form POST, calls API for validation, sets cookie, returns 302 redirect.
 * No fetch from client. No JSON + redirect mix. Pure HTTP.
 */
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
    return NextResponse.redirect(failUrl);
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-proxy": "true" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  const json = (await resp.json().catch(() => null)) as { ok?: boolean } | null;
  if (resp.status !== 200 || !json?.ok) {
    // eslint-disable-next-line no-console
    console.log("[ADMIN_LOGIN]", { ok: false, email, apiStatus: resp.status });
    const failUrl = new URL("/login", req.url);
    failUrl.searchParams.set("error", "invalid");
    if (redirectPath !== "/") failUrl.searchParams.set("next", redirectPath);
    return NextResponse.redirect(failUrl);
  }

  const res = NextResponse.redirect(new URL(redirectPath, req.url), 302);
  const setCookie = resp.headers.get("set-cookie");
  if (setCookie) res.headers.set("set-cookie", setCookie);
  // eslint-disable-next-line no-console
  console.log("[ADMIN_LOGIN]", { ok: true, email, redirectPath, hasCookie: true });
  return res;
}
