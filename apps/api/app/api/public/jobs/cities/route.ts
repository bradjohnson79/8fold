import { NextResponse } from "next/server";
import { listCitiesWithJobCounts } from "../../../../../src/server/repos/jobPublicRepo.drizzle";
import type { CountryCode2 } from "../../../../../src/locations/datasets";

const US_STATE_CODES_50 = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
]);

const CA_PROVINCE_CODES_10 = new Set([
  "AB","BC","MB","NB","NL","NS","ON","PE","QC","SK",
]);

function inferCountryFromRegionCode(regionCode: string): CountryCode2 {
  return CA_PROVINCE_CODES_10.has(regionCode) ? "CA" : "US";
}

function isAllowedRegion(country: CountryCode2, regionCode: string): boolean {
  const rc = regionCode.trim().toUpperCase();
  if (country === "US") return US_STATE_CODES_50.has(rc);
  return CA_PROVINCE_CODES_10.has(rc);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const regionParam = String(url.searchParams.get("region") ?? "").trim().toUpperCase();

    if (!regionParam || regionParam.length !== 2) {
      return NextResponse.json(
        { error: "Invalid region: must be a 2-letter region code", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    const country = inferCountryFromRegionCode(regionParam);
    if (!isAllowedRegion(country, regionParam)) {
      return NextResponse.json(
        { error: "Invalid region: unknown region code", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    const rows = await listCitiesWithJobCounts(country, regionParam);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("PUBLIC_DISCOVERY_ERROR", { route: "/api/public/jobs/cities", error: err });
    return NextResponse.json({ error: "PUBLIC_DISCOVERY_FAILED" }, { status: 500 });
  }
}
