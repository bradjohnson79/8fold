import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";
import { apiFetch } from "@/server/api/apiClient";

export async function POST(req: Request) {
  // IMPORTANT: logout must revoke the DB-backed session in apps/api (not just clear the cookie).
  const upstream = await apiFetch({
    path: "/api/auth/logout",
    method: "POST",
    request: req, // forwards cookie so apps/api can revoke
  });

  const bodyText = await upstream.text().catch(() => "");
  const res = new NextResponse(bodyText || JSON.stringify({ ok: upstream.ok }), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });

  // Forward upstream cookie clear.
  const h: any = upstream.headers as any;
  const setCookies: string[] = typeof h.getSetCookie === "function" ? h.getSetCookie() : [];
  if (setCookies.length) {
    for (const c of setCookies) res.headers.append("set-cookie", c);
  } else {
    const sc = upstream.headers.get("set-cookie");
    if (sc) res.headers.append("set-cookie", sc);
  }

  // Belt + suspenders: also clear cookie at web edge.
  res.headers.append(
    "Set-Cookie",
    [
      `${SESSION_COOKIE_NAME}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "Max-Age=0",
    ].join("; "),
  );
  return res;
}

