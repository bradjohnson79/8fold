/**
 * LGS proxy: discovery run status (for polling).
 * Must NEVER return 500 — the frontend polls every 2 seconds.
 */
import { NextResponse } from "next/server";
import { proxyToApi } from "@/server/api/proxy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await proxyToApi(`/api/lgs/discovery/runs/${id}/status`);
    const data = await res.json().catch(() => ({ ok: false, error: "json_parse_failed" }));
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("LGS status proxy error:", err);
    return NextResponse.json({ ok: false, error: "proxy_error" }, { status: 200 });
  }
}
