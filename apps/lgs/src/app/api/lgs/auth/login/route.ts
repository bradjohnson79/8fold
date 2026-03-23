import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";
import { fetchWithLgsTimeout } from "@/server/upstreamFetch";

const LGS_SESSION_COOKIE = "lgs_session";

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signLgsSessionToken(secret: string): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      role: "LGS_OPERATOR",
      iat: nowSeconds,
      exp: nowSeconds + 60 * 60 * 8,
    })
  );
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${header}.${payload}.${signature}`;
}

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

    const text = await resp.text();
    const out = new NextResponse(text, { status: resp.status });
    out.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");

    if (resp.ok) {
      const secret = String(process.env.ADMIN_JWT_SECRET ?? "").trim();
      if (!secret) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "LGS_AUTH_UNAVAILABLE",
              message: "Authentication is not configured.",
            },
          },
          { status: 503 }
        );
      }

      const token = signLgsSessionToken(secret);
      out.headers.set(
        "set-cookie",
        `${LGS_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
      );
    }

    return out;
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
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
