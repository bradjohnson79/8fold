import { NextRequest, NextResponse } from "next/server";
import { proxyToApiRaw } from "@/server/api/proxy";

export async function POST(req: NextRequest) {
  const res = await proxyToApiRaw("/api/lgs/outreach/inbound", req);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
