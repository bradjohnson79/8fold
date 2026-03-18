import { NextResponse } from "next/server";
import { proxyToApiRaw } from "@/server/api/proxy";

export async function POST(req: Request) {
  const res = await proxyToApiRaw("/api/lgs/leads/set-stage", req);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
