/**
 * LGS proxy: single job poster lead detail (GET) and editable field update (PATCH).
 */
import { NextRequest, NextResponse } from "next/server";
import { proxyToApi, proxyToApiRaw } from "@/server/api/proxy";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await proxyToApi(`/api/lgs/job-poster-leads/${id}`);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const res = await proxyToApiRaw(`/api/lgs/job-poster-leads/${id}`, req);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
