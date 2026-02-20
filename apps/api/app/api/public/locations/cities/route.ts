import { NextResponse } from "next/server";
import { toHttpError } from "../../../../../src/http/errors";
import { listCitiesByRegion } from "../../../../../src/server/repos/jobPublicRepo.drizzle";

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
  try {
    const url = new URL(req.url);
    const state = normalizeRegionCode(url.searchParams.get("state"));
    const regionCode = normalizeRegionCode(url.searchParams.get("regionCode")) || state;
    const country = normalizeCountry(url.searchParams.get("country")) ?? (regionCode ? inferCountryFromRegionCode(regionCode) : null);
    if (!country || !regionCode || regionCode.length !== 2) {
      return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 });
    }

    const cities = await listCitiesByRegion(country, regionCode);
    return NextResponse.json({ ok: true, cities }, { status: 200 });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

