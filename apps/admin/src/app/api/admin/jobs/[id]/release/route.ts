import { NextResponse } from "next/server";
import { getValidatedApiOrigin } from "@/server/env";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const apiOrigin = getValidatedApiOrigin();
  const url = new URL(`${apiOrigin}/api/admin/jobs/${encodeURIComponent(id)}/release`);
  const incoming = new URL(req.url);
  for (const [k, v] of incoming.searchParams.entries()) url.searchParams.set(k, v);

  const body = await req.text();
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "content-type": req.headers.get("content-type") ?? "application/json",
      cookie: req.headers.get("cookie") ?? "",
    },
    body,
    cache: "no-store",
  });

  const text = await resp.text();
  const res = new NextResponse(text, { status: resp.status });
  res.headers.set("content-type", resp.headers.get("content-type") ?? "application/json");
  return res;
}

