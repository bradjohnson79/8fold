/**
 * LGS proxy: consolidate company emails (one lead per domain).
 */
import { NextRequest, NextResponse } from "next/server";
import { proxyToApiRaw } from "@/server/api/proxy";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const preview = url.searchParams.get("preview");
  const target = preview
    ? `/api/lgs/leads/consolidate?preview=${preview}`
    : "/api/lgs/leads/consolidate";
  const res = await proxyToApiRaw(target, req);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
