import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

const ADMIN_SESSION_COOKIE_NAME = "admin_session";

export async function POST(req: Request) {
  const apiOrigin = getValidatedApiOrigin();
  const url = `${apiOrigin}/api/admin/login`;

  const body = await req.text();
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": req.headers.get("content-type") ?? "application/json",
      "x-admin-proxy": "true",
    },
    body,
    cache: "no-store",
  });

  const json = (await resp.json().catch(() => null)) as { ok?: boolean; data?: { admin?: unknown; sessionToken?: string; expiresAt?: string } } | null;
  if (resp.status !== 200 || !json) {
    return NextResponse.json(json ?? { ok: false, error: "unauthorized" }, { status: resp.status });
  }

  const res = NextResponse.json(
    { ok: json.ok, data: { admin: json.data?.admin } },
    { status: 200 },
  );
  res.headers.set("content-type", "application/json");

  const token = json.data?.sessionToken;
  const expiresAt = json.data?.expiresAt;
  if (token && expiresAt) {
    const secure = process.env.NODE_ENV === "production";
    const parts = [
      `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Expires=${new Date(expiresAt).toUTCString()}`,
      secure ? "Secure" : null,
    ].filter(Boolean);
    res.headers.set("Set-Cookie", parts.join("; "));
  }
  return res;
}

