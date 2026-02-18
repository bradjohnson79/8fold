import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

export async function POST(req: Request) {
  const apiOrigin = getValidatedApiOrigin();
  const url = `${apiOrigin}/api/admin/signup`;

  const body = await req.text();
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
    body,
    cache: "no-store",
  });

  const text = await resp.text();
  const res = new NextResponse(text, { status: resp.status });
  res.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
  return res;
}

