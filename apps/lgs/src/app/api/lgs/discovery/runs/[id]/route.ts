/**
 * LGS proxy: discovery run get.
 */
import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await proxyToApi(`/api/lgs/discovery/runs/${id}`);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
