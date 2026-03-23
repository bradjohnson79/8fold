import { NextRequest, NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.toString();
  const res = await proxyToApi(`/api/lgs/outreach/job-posters/queue${search ? `?${search}` : ""}`, {
    method: "GET",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const res = await proxyToApi("/api/lgs/outreach/job-posters/queue", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
