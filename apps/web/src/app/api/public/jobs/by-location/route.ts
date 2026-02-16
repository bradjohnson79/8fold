import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/publicDiscoveryHandlers";
import { bus } from "@/server/bus/bus";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const country = (url.searchParams.get("country") ?? "US").toUpperCase() === "CA" ? "CA" : "US";
  const regionCode = String(url.searchParams.get("regionCode") ?? "").toUpperCase();
  const city = String(url.searchParams.get("city") ?? "").trim();

  if (!regionCode || !city) {
    return NextResponse.json({ ok: false, error: "Missing regionCode or city", code: "INVALID_INPUT" }, { status: 400 });
  }

  const requestId = crypto.randomUUID();
  try {
    const out = await bus.dispatch({
      type: "public.jobs.byLocation",
      payload: { country, regionCode, city, limit: url.searchParams.get("limit") },
      context: { requestId, now: new Date() },
    });
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Failed to load jobs", code: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

