import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET() {
  const res = await proxyToApi("/api/dise/dashboard");
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
