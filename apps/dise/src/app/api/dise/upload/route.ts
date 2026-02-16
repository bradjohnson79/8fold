import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const res = await proxyToApi("/api/dise/upload", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

