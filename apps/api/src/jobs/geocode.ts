const cache = new Map<string, { lat: number; lng: number }>();

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
};

function ua(): string {
  return process.env.NOMINATIM_USER_AGENT || "8FoldLocal/1.0 (contact@yourdomain.com)";
}

function guessCountryFromStateCode(state: string): "Canada" | "United States" {
  const s = state.trim().toUpperCase();
  const ca = new Set(["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"]);
  return ca.has(s) ? "Canada" : "United States";
}

export function regionToCityState(region: string): { city: string; state: string } | null {
  const parts = String(region ?? "").split("-").filter(Boolean);
  if (parts.length < 2) return null;
  const state = parts[parts.length - 1]!;
  const city = parts.slice(0, -1).join(" ");
  return { city, state };
}

async function nominatimGeocode(q: string, limit = 1): Promise<{ lat: number; lng: number } | null> {
  const query = String(q ?? "").trim();
  if (!query) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(Math.max(1, Math.min(3, Math.trunc(limit || 1)))));
  url.searchParams.set("q", query);
  url.searchParams.set("countrycodes", "ca,us");
  url.searchParams.set("dedupe", "1");

  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": ua(), Accept: "application/json" },
    cache: "no-store",
  });
  if (!resp.ok) return null;
  const json = (await resp.json().catch(() => null)) as NominatimResult[] | null;
  const first = Array.isArray(json) ? json[0] : null;
  const lat = first?.lat ? Number(first.lat) : NaN;
  const lng = first?.lon ? Number(first.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function geocodeCityCentroid(opts: {
  city: string;
  state: string;
  country?: string;
}): Promise<{ lat: number; lng: number } | null> {
  const city = String(opts.city ?? "").trim();
  const state = String(opts.state ?? "").trim();
  const country = String((opts.country ?? "") || guessCountryFromStateCode(state)).trim();
  if (!city || !state) return null;

  const key = `place|${city.toLowerCase()}|${state.toLowerCase()}|${country.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const q = `${city}, ${state}, ${country}`;
  const out = await nominatimGeocode(q, 1);
  if (!out) return null;
  cache.set(key, out);
  return out;
}

export async function geocodeStreetAddress(opts: {
  street: string;
  city: string;
  state: string;
  country2: "CA" | "US";
}): Promise<{ lat: number; lng: number } | null> {
  const street = String(opts.street ?? "").trim();
  const city = String(opts.city ?? "").trim();
  const state = String(opts.state ?? "").trim();
  const country = opts.country2 === "CA" ? "Canada" : "United States";
  if (!street || !city || !state) return null;

  const key = `addr|${street.toLowerCase()}|${city.toLowerCase()}|${state.toLowerCase()}|${opts.country2}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const q = `${street}, ${city}, ${state}, ${country}`;
  const out = await nominatimGeocode(q, 1);
  if (!out) return null;
  cache.set(key, out);
  return out;
}

