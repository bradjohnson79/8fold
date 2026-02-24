import { NextResponse } from "next/server";
import { getApiOrigin } from "@/server/api/apiClient";

/**
 * Web proxy for POST /api/auth/logout.
 * Forwards request to apps/api to revoke session and clear sid cookie.
 */
export async function POST(req: Request) {
  try {
    const apiOrigin = getApiOrigin();
    const cookie = req.headers.get("cookie") ?? "";
    const authz = req.headers.get("authorization") ?? req.headers.get("Authorization");

    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(authz ? { authorization: authz } : {}),
    };

    const resp = await fetch(`${apiOrigin}/api/auth/logout`, {
      method: "POST",
      headers,
      cache: "no-store",
    });

    const text = await resp.text();
    const res = new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });

    // Forward Set-Cookie from API to clear sid
    const setCookie = resp.headers.get("set-cookie");
    if (setCookie) res.headers.set("set-cookie", setCookie);

    // Also clear sid locally for robustness (API may not set it if no sid was sent)
    res.cookies.set("sid", "", {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(0),
      maxAge: 0,
    });

    return res;
  } catch (err) {
    // Best-effort: still clear cookie and return 200 so client can proceed with Clerk signOut
    const res = NextResponse.json({ ok: true });
    res.cookies.set("sid", "", {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(0),
      maxAge: 0,
    });
    return res;
  }
}
