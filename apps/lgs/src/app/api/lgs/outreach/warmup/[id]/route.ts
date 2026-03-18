import { NextRequest, NextResponse } from "next/server";
import { proxyToApiRaw } from "@/server/api/proxy";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await proxyToApiRaw(`/api/lgs/outreach/warmup/${id}`, req);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
