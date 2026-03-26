import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/publicDiscoveryHandlers";
import { bus } from "@/server/bus/bus";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const city = String(url.searchParams.get("city") ?? "").trim();

  if (!city) {
    return NextResponse.json({ ok: false, error: "Missing city", code: "INVALID_INPUT" }, { status: 400 });
  }

  const requestId = crypto.randomUUID();
  try {
    const out = await bus.dispatch({
      type: "public.jobs.homepagePreview",
      payload: { city, limit: url.searchParams.get("limit") },
      context: { requestId, now: new Date() },
    });
    return NextResponse.json(out, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to load jobs", code: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}
