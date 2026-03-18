/**
 * LGS proxy: messages approve.
 */
import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await proxyToApi(`/api/lgs/messages/${id}/approve`, {
    method: "POST",
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
