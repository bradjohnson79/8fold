import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";
import { fetchWithLgsTimeout } from "@/server/upstreamFetch";

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

    const setCookie = resp.headers.get("set-cookie");
    if (setCookie) out.headers.set("set-cookie", setCookie);

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
