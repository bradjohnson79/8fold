type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
};

const cache = new Map<string, { lat: number; lng: number }>();

function ua(): string {
  return (
    process.env.NOMINATIM_USER_AGENT ||
    "8FoldLocal/1.0 (dev; city-centroid fallback)"
  );
}

export function regionToCityState(region: string): { city: string; state: string } | null {
  const parts = String(region ?? "").split("-").filter(Boolean);
  if (parts.length < 2) return null;
  const state = parts[parts.length - 1]!;
  const city = parts.slice(0, -1).join(" ");
  return { city, state };
}

function guessCountryFromStateCode(state: string): "Canada" | "United States" {
  const s = state.trim().toUpperCase();
  const ca = new Set([
    "BC","AB","SK","MB","ON","QC","NB","NS","PE","NL","YT","NT","NU"
  ]);
  return ca.has(s) ? "Canada" : "United States";
}

export async function geocodeCityCentroid(opts: {
  city: string;
  state: string;
  country?: string;
}): Promise<{ lat: number; lng: number } | null> {
  const city = opts.city.trim();
  const state = opts.state.trim();
  const country = (opts.country?.trim() || guessCountryFromStateCode(state)).trim();
  if (!city || !state) return null;

  const key = `${city.toLowerCase()}|${state.toLowerCase()}|${country.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const q = `${city}, ${state}, ${country}`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", q);

  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": ua(), Accept: "application/json" }
  });
  if (!resp.ok) return null;

  const json = (await resp.json()) as NominatimResult[];
  const first = json?.[0];
  const lat = first?.lat ? Number(first.lat) : NaN;
  const lng = first?.lon ? Number(first.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const out = { lat, lng };
  cache.set(key, out);
  return out;
}

