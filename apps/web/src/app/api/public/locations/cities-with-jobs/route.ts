import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/publicDiscoveryHandlers";
import { bus } from "@/server/bus/bus";

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const country = url.searchParams.get("country");
    const regionCode = url.searchParams.get("regionCode");
    const out = await bus.dispatch({
      type: "public.locations.citiesWithJobs",
      payload: { country, regionCode },
      context: { requestId, now: new Date() },
    });
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Failed to load cities", code: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

