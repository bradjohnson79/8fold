/**
 * LGS proxy route (apps/lgs).
 * Forwards multipart import to apps/api.
 */
import { NextResponse } from "next/server";
import { proxyToApiRaw } from "@/server/api/proxy";

export async function POST(req: Request) {
  const res = await proxyToApiRaw("/api/lgs/outreach/contacts/import", req);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
