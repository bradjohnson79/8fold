import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

export async function POST(req: Request) {
  try {
    const apiOrigin = getValidatedApiOrigin();
    const url = `${apiOrigin}/api/admin/auth/bootstrap`;
    const body = await req.text();
    const resp = await fetch(url, {
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
    return out;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UPSTREAM_ERROR",
          message: "Admin creation failed.",
        },
      },
      { status: 500 },
    );
  }
}
