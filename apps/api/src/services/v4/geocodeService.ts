import { JobGeoSchema } from "@/src/validation/v4/jobGeoSchema";
import { badRequest, internal } from "@/src/services/v4/v4Errors";

export async function geocodeWithOsm(query: string) {
  const q = String(query ?? "").trim();
  if (!q) throw badRequest("V4_GEO_QUERY_REQUIRED", "query is required");

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "8Fold-V4-Geocode/1.0",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw internal("V4_GEO_PROVIDER_FAILED", "OSM geocode failed");
  }

  const raw = (await response.json()) as Array<any>;
  const results = raw.map((row) => {
    const parsed = JobGeoSchema.safeParse({
      latitude: Number(row?.lat),
      longitude: Number(row?.lon),
      provinceState:
        String(row?.address?.state_code ?? row?.address?.state ?? row?.address?.province ?? "")
          .trim()
          .toUpperCase() || "NA",
      formattedAddress: String(row?.display_name ?? "").trim(),
    });
    return parsed.success
      ? {
          latitude: parsed.data.latitude,
          longitude: parsed.data.longitude,
          provinceState: parsed.data.provinceState,
          formattedAddress: parsed.data.formattedAddress,
        }
      : null;
  });

  return {
    ok: true as const,
    results: results.filter(Boolean),
  };
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
  const candidate = String(
    raw?.address?.state_code ?? raw?.address?.state ?? raw?.address?.province ?? raw?.address?.region ?? ""
  )
    .trim()
    .toUpperCase();
  if (!candidate) throw badRequest("V4_GEO_PROVINCE_RESOLVE_FAILED", "Unable to resolve province from coordinates");
  return candidate;
}
