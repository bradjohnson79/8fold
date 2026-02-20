import { NextResponse } from "next/server";
import crypto from "node:crypto";
import "@/server/commands/publicDiscoveryHandlers";
import { bus } from "@/server/bus/bus";

function normalizeCountry(input: string | null): "US" | "CA" | null {
  const v = String(input ?? "").trim().toUpperCase();
  if (v === "US" || v === "CA") return v;
  return null;
}

function normalizeRegionCode(input: string | null): string {
  return String(input ?? "").trim().toUpperCase();
}

function inferCountryFromRegionCode(regionCode: string): "US" | "CA" {
  const ca = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "ON", "PE", "QC", "SK"]);
  return ca.has(regionCode) ? "CA" : "US";
}

export async function GET(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const state = normalizeRegionCode(url.searchParams.get("state"));
    const regionCode = normalizeRegionCode(url.searchParams.get("regionCode")) || state;
    const country = normalizeCountry(url.searchParams.get("country")) ?? (regionCode ? inferCountryFromRegionCode(regionCode) : null);
    const out = await bus.dispatch({
      type: "public.locations.citiesWithJobs",
      payload: { country, regionCode, state },
      context: { requestId, now: new Date() },
    });
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Failed to load cities", code: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

