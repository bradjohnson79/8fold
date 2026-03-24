import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";
import { fetchWithLgsTimeout } from "@/server/upstreamFetch";

const LGS_SESSION_COOKIE = "lgs_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export async function POST(req: Request) {
  try {
    const apiOrigin = getValidatedApiOrigin();
    const url = `${apiOrigin}/api/lgs/auth/login`;
    const body = await req.text();

    const resp = await fetchWithLgsTimeout(url, {
      method: "POST",
      headers: {
        "content-type": req.headers.get("content-type") ?? "application/json",
        "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "",
        "user-agent": req.headers.get("user-agent") ?? "",
      },
      body,
      cache: "no-store",
    });

    // Parse JSON response from API
    let json: { ok: boolean; data?: { authenticated?: boolean; token?: string }; error?: unknown };
    try {
      json = await resp.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "UPSTREAM_ERROR", message: "Login failed." } },
        { status: 502 }
      );
    }

    if (!resp.ok || !json?.data?.token) {
      return NextResponse.json(
        { ok: false, error: json?.error ?? { code: "UNAUTHORIZED", message: "Invalid password" } },
        { status: resp.status }
      );
    }

    // Set the cookie from this LGS app using NextResponse.cookies.set()
    // This is the reliable App Router method — manually setting set-cookie headers
    // in a proxy response does not work consistently in Next.js.
    const token = json.data.token;
    const response = NextResponse.json({ ok: true, data: { authenticated: true } }, { status: 200 });
    response.cookies.set(LGS_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (err: unknown) {
    const status = typeof (err as { status?: number })?.status === "number"
      ? (err as { status: number }).status
      : 500;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: status === 504 ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
          message: status === 504 ? "Login upstream timeout." : "Login failed.",
        },
      },
      { status },
    );
  }
}
