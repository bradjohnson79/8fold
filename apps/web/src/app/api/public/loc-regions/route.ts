import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/publicDiscoveryHandlers";
import { bus } from "@/server/bus/bus";

/**
 * Back-compat alias.
 *
 * Some older clients still call `/api/public/loc-regions`.
 * Public reads must never call GPT or depend on AI appraisal fields.
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const out = await bus.dispatch({
      type: "public.locations.regionsWithJobs",
      payload: {},
      context: { requestId, now: new Date() },
    });
    return NextResponse.json({ ok: true, regions: (out as any)?.regions ?? [] }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Failed to load regions", code: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

