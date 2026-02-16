import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await proxyToApi(`/api/dise/directories/${id}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await proxyToApi(`/api/dise/directories/${id}`, {
    method: "PATCH",
    body,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
