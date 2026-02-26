import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

export async function GET(req: Request) {
  const apiOrigin = getValidatedApiOrigin();
  const url = `${apiOrigin}/api/admin/v4/auth/me`;

  const resp = await fetch(url, {
    method: "GET",
    headers: { cookie: req.headers.get("cookie") ?? "" },
    cache: "no-store",
  });

  const text = await resp.text();
  const out = new NextResponse(text, { status: resp.status });
  out.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
  return out;
}
