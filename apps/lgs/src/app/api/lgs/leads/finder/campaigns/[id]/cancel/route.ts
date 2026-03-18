import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await proxyToApi(`/api/lgs/leads/finder/campaigns/${id}/cancel`, { method: "POST", body: {} });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
