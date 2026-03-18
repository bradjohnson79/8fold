import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET() {
  const res = await proxyToApi("/api/lgs/leads/finder/campaigns", { method: "GET" });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const res = await proxyToApi("/api/lgs/leads/finder/campaigns", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function OPTIONS() {
  const res = await proxyToApi("/api/lgs/leads/finder/campaigns", { method: "OPTIONS", body: {} });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
