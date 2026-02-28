import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";
import { getAdminAuthHeader } from "@/server/adminAuth";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const apiOrigin = getValidatedApiOrigin();
    const authorization = await getAdminAuthHeader(req);
    const url = new URL(`${apiOrigin}/api/admin/v4/jobs/${encodeURIComponent(id)}/complete`);
    const incoming = new URL(req.url);
    for (const [k, v] of incoming.searchParams.entries()) url.searchParams.set(k, v);

    const body = await req.text();
    const resp = await fetch(url.toString(), {
      method: "POST",
      headers: {
        authorization,
        "content-type": req.headers.get("content-type") ?? "application/json",
      },
      body,
      cache: "no-store",
    });

    const text = await resp.text();
    const res = new NextResponse(text, { status: resp.status });
    res.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
    return res;
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: status === 401 ? "UNAUTHORIZED" : "UPSTREAM_ERROR",
          message: status === 401 ? "Authentication required." : "Request failed.",
        },
      },
      { status },
    );
  }
}
