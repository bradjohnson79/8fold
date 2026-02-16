import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const res = await proxyToApi("/api/dise/directories", { searchParams });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
