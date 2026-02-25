import { NextResponse } from "next/server";
import { getApiOrigin } from "@/server/api/apiClient";

/**
 * ⚠ LEGACY AUTH — MOBILE / OTP FLOW ONLY.
 * Web authentication is handled exclusively by Clerk.
 * Do NOT use this route in web flows.
 *
 * Web proxy for POST /api/auth/verify.
 * Proxies to apps/api; forwards Set-Cookie (sid) from API response.
 */
export async function POST(req: Request) {
  try {
    const apiOrigin = getApiOrigin();
    const body = await req.arrayBuffer();
    const contentType = req.headers.get("content-type") ?? "application/json";
    const cookie = req.headers.get("cookie") ?? "";

    const resp = await fetch(`${apiOrigin}/api/auth/verify`, {
      method: "POST",
      headers: {
        "content-type": contentType,
        ...(cookie ? { cookie } : {}),
      },
      body,
      cache: "no-store",
    });

    const text = await resp.text();
    const res = new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
    });

    const setCookie = resp.headers.get("set-cookie");
    if (setCookie) res.headers.set("set-cookie", setCookie);

    return res;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }
}
