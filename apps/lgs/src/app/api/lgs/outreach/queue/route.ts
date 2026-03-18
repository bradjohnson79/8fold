/**
 * LGS proxy route (apps/lgs).
 */
import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const searchParams = new URLSearchParams(url.searchParams);
  const res = await proxyToApi(`/api/lgs/outreach/queue?${searchParams.toString()}`);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
