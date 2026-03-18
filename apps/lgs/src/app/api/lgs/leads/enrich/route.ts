/**
 * LGS proxy: email enrichment endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { proxyToApi, proxyToApiRaw } from "@/server/api/proxy";

export async function POST(req: NextRequest) {
  const res = await proxyToApiRaw("/api/lgs/leads/enrich", req);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function GET() {
  const res = await proxyToApi("/api/lgs/leads/enrich");
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
