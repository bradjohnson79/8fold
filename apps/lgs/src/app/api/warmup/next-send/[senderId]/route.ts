import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ senderId: string }> },
) {
  const { senderId } = await params;
  const res = await proxyToApi(`/api/warmup/next-send/${senderId}`);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
