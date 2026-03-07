import { JobGeoSchema } from "@/src/validation/v4/jobGeoSchema";
import { badRequest, internal } from "@/src/services/v4/v4Errors";

const STREET_ABBREVS: [RegExp, string][] = [
  [/\bstreet\b/gi, "St"],
  [/\bavenue\b/gi, "Ave"],
  [/\broad\b/gi, "Rd"],
  [/\bboulevard\b/gi, "Blvd"],
  [/\bdrive\b/gi, "Dr"],
  [/\blane\b/gi, "Ln"],
  [/\bcourt\b/gi, "Ct"],
  [/\bplace\b/gi, "Pl"],
  [/\bhighway\b/gi, "Hwy"],
];

/** Normalize query: trim, abbreviate street terms, title case. */
export function normalizeGeocodeQuery(query: string): string {
  let q = String(query ?? "").trim();
  if (!q) return q;

  for (const [re, repl] of STREET_ABBREVS) {
    q = q.replace(re, repl);
  }

  q = q
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

  return q.trim();
}

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  provinceState: string;
  formattedAddress: string;
  city?: string;
  postalCode?: string;
  countryCode?: string;
};

export async function geocodeWithOsm(query: string): Promise<{ ok: true; results: GeocodeResult[] }> {
  const raw = String(query ?? "").trim();
  if (!raw) throw badRequest("V4_GEO_QUERY_REQUIRED", "query is required");
  if (raw.length < 3) return { ok: true as const, results: [] };

  const q = normalizeGeocodeQuery(raw);

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "ca,us");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "8Fold-App",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw internal("V4_GEO_PROVIDER_FAILED", "OSM geocode failed");
  }

  const rawRows = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
    address?: {
      city?: string;
      town?: string;
      municipality?: string;
      village?: string;
      postcode?: string;
      state_code?: string;
      state?: string;
      province?: string;
      country_code?: string;
    };
  }>;

  const results: GeocodeResult[] = [];

  for (const row of rawRows) {
    const lat = Number(row?.lat);
    const lon = Number(row?.lon);
    const displayName = String(row?.display_name ?? "").trim();
    const addr = row?.address ?? {};
    const provinceState =
      String(addr.state_code ?? addr.state ?? addr.province ?? "").trim().toUpperCase() || "NA";
    const city =
      String(addr.city ?? addr.town ?? addr.municipality ?? addr.village ?? "").trim() || undefined;
    const postalCode = String(addr.postcode ?? "").trim() || undefined;
    const countryCode = String(addr.country_code ?? "").trim().toUpperCase() || undefined;

    const parsed = JobGeoSchema.safeParse({
      latitude: lat,
      longitude: lon,
      provinceState,
      formattedAddress: displayName,
    });

    if (parsed.success) {
      results.push({
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        provinceState: parsed.data.provinceState,
        formattedAddress: parsed.data.formattedAddress,
        city: city || undefined,
        postalCode: postalCode || undefined,
        countryCode: countryCode || undefined,
      });
    }
  }

  return { ok: true as const, results };
}

const PROVINCE_NAME_TO_CODE: Record<string, string> = {
  "BRITISH COLUMBIA": "BC", "ALBERTA": "AB", "SASKATCHEWAN": "SK", "MANITOBA": "MB",
  "ONTARIO": "ON", "QUEBEC": "QC", "NEW BRUNSWICK": "NB", "NOVA SCOTIA": "NS",
  "PRINCE EDWARD ISLAND": "PE", "NEWFOUNDLAND AND LABRADOR": "NL", "YUKON": "YT",
  "NORTHWEST TERRITORIES": "NT", "NUNAVUT": "NU",
  "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR", "CALIFORNIA": "CA",
  "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE", "DISTRICT OF COLUMBIA": "DC",
  "FLORIDA": "FL", "GEORGIA": "GA", "HAWAII": "HI", "IDAHO": "ID", "ILLINOIS": "IL",
  "INDIANA": "IN", "IOWA": "IA", "KANSAS": "KS", "KENTUCKY": "KY", "LOUISIANA": "LA",
  "MAINE": "ME", "MARYLAND": "MD", "MASSACHUSETTS": "MA", "MICHIGAN": "MI", "MINNESOTA": "MN",
  "MISSISSIPPI": "MS", "MISSOURI": "MO", "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV",
  "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH", "OKLAHOMA": "OK",
  "OREGON": "OR", "PENNSYLVANIA": "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD", "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT", "VERMONT": "VT",
  "VIRGINIA": "VA", "WASHINGTON": "WA", "WEST VIRGINIA": "WV", "WISCONSIN": "WI", "WYOMING": "WY",
};

export function normalizeRegionToCode(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (upper.length <= 2) return upper;
  return PROVINCE_NAME_TO_CODE[upper] ?? upper;
}

export async function reverseGeocodeProvince(latitude: number, longitude: number): Promise<string> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("zoom", "8");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "8Fold-V4-Geocode/1.0",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) throw internal("V4_GEO_PROVIDER_FAILED", "OSM reverse geocode failed");

  const raw = (await response.json()) as any;
  const rawCandidate = String(
    raw?.address?.state_code ?? raw?.address?.state ?? raw?.address?.province ?? raw?.address?.region ?? ""
  ).trim();
  if (!rawCandidate) throw badRequest("V4_GEO_PROVINCE_RESOLVE_FAILED", "Unable to resolve province from coordinates");
  return normalizeRegionToCode(rawCandidate);
}
