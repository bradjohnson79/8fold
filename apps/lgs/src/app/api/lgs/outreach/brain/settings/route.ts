/**
 * Proxy: outreach/brain/settings
 */
import { NextResponse } from "next/server";
import { proxyToApi, proxyToApiRaw } from "@/server/api/proxy";

export async function GET() {
  const res = await proxyToApi("/api/lgs/outreach/brain/settings");
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(req: Request) {
  const res = await proxyToApiRaw("/api/lgs/outreach/brain/settings", req);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
