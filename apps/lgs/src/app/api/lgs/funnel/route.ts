/**
 * LGS proxy: funnel aggregates.
 */
import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET() {
  const res = await proxyToApi("/api/lgs/funnel");
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
