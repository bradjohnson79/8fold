/**
 * LGS proxy: discovery bulk (file upload or JSON).
 */
import { NextResponse } from "next/server";
import { proxyToApi, proxyToApiRaw } from "@/server/api/proxy";

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const res = await proxyToApiRaw("/api/lgs/discovery/bulk", req);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  }
  const body = await req.json().catch(() => ({}));
  const res = await proxyToApi("/api/lgs/discovery/bulk", {
    method: "POST",
    body,
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
