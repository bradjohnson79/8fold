import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/publicDiscoveryHandlers";
import { bus } from "@/server/bus/bus";

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));
    const out = await bus.dispatch({
      type: "public.jobs.flag",
      payload: body,
      context: { requestId, now: new Date() },
    });
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Failed to submit flag", code: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

