import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/publicDiscoveryHandlers";
import { bus } from "@/server/bus/bus";

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit");
    const out = await bus.dispatch({
      type: "public.jobs.recent",
      payload: { limit },
      context: { requestId, now: new Date() },
    });
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Failed to load jobs", code: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

