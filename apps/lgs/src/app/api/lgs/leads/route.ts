/**
 * LGS proxy: leads — forwards all query params to API.
 */
import { NextRequest, NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.toString();
  const res = await proxyToApi(`/api/lgs/leads${search ? `?${search}` : ""}`);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
