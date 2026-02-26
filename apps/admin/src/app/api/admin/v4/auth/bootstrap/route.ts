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
  const url = `${apiOrigin}/api/admin/v4/auth/bootstrap`;

  const raw = await req.text();
  const parsed = JSON.parse(raw || "{}") as {
    email?: string;
    password?: string;
    adminSecret?: string;
    bootstrapToken?: string;
    inviteToken?: string;
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-proxy": "true" },
    body: JSON.stringify({
      email: parsed.email,
      password: parsed.password,
      bootstrapToken: parsed.bootstrapToken ?? parsed.adminSecret,
      inviteToken: parsed.inviteToken,
    }),
    cache: "no-store",
  });

  const json = (await resp.json().catch(() => null)) as { ok?: boolean; data?: { sessionToken?: string; expiresAt?: string } } | null;
  const out = NextResponse.json(json, { status: resp.status });
  const sessionToken = String(json?.data?.sessionToken ?? "").trim();
  if (sessionToken) {
    setAdminSessionCookie(out, sessionToken, json?.data?.expiresAt);
  } else {
    const setCookie = resp.headers.get("set-cookie");
    if (setCookie) out.headers.set("set-cookie", setCookie);
  }
  return out;
}
