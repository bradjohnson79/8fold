import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/publicDiscoveryHandlers";
import { bus } from "@/server/bus/bus";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const out = await bus.dispatch({
      type: "public.jobs.recent",
      payload: { limit: 30 },
      context: { requestId, now: new Date() },
    });
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load jobs";
    return NextResponse.json({ ok: false, error: message, code: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

