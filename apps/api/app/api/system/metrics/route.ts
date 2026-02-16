import { NextResponse } from "next/server";
import { snapshotCounters } from "../../../../src/server/observability/metrics";

export async function GET() {
  // Dev-first endpoint. In production, wire this behind an internal auth boundary.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, counters: snapshotCounters(), timestamp: new Date().toISOString() }, { status: 200 });
}

