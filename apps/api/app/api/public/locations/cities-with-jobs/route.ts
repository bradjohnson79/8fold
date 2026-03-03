import { NextResponse } from "next/server";
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

function titleCaseCity(slugOrCity: string): string {
  const cleaned = slugOrCity.trim().replace(/[-_]+/g, " ");
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const state = normalizeRegionCode(url.searchParams.get("state"));
    const regionCode = normalizeRegionCode(url.searchParams.get("regionCode")) || state;
    const country = normalizeCountry(url.searchParams.get("country")) ?? (regionCode ? inferCountryFromRegionCode(regionCode) : null);
    if (!country || !regionCode || regionCode.length !== 2) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }

    const out = await listCitiesByRegion(country, regionCode);
    return NextResponse.json(out);
  } catch (err) {
    console.error("PUBLIC_DISCOVERY_ERROR", { route: "/api/public/locations/cities-with-jobs", error: err });
    return NextResponse.json({ error: "PUBLIC_DISCOVERY_FAILED" }, { status: 500 });
  }
}

