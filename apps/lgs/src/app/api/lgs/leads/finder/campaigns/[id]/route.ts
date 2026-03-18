import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const page = url.searchParams.get("page") ?? "1";
  const res = await proxyToApi(`/api/lgs/leads/finder/campaigns/${id}?page=${page}`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
