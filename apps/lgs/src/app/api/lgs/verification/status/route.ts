/**
 * LGS proxy: verification/status
 */
import { NextRequest, NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.toString();
  const res = await proxyToApi(`/api/lgs/verification/status${search ? `?${search}` : ""}`);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
