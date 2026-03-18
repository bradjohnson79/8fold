/**
 * LGS proxy route (apps/lgs).
 */
import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await proxyToApi(`/api/lgs/outreach/messages/${id}/reject`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
