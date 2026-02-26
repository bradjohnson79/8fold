import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

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
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  const json = (await resp.json().catch(() => null)) as { ok?: boolean } | null;
  if (!resp.ok || !json?.ok) {
    const failUrl = new URL("/login", req.url);
    failUrl.searchParams.set("error", "invalid");
    if (redirectPath !== "/") failUrl.searchParams.set("next", redirectPath);
    return NextResponse.redirect(failUrl, 302);
  }

  const out = NextResponse.redirect(new URL(redirectPath, req.url), 302);
  const setCookie = resp.headers.get("set-cookie");
  if (setCookie) out.headers.set("set-cookie", setCookie);
  return out;
}
