import { NextResponse } from "next/server";

type NominatimJsonV2 = {
  place_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
  address?: Record<string, unknown>;
};

function ua(): string {
  // Nominatim policy: identify your application via a User-Agent with contact info.
  return process.env.NOMINATIM_USER_AGENT || "8FoldLocal/1.0 (bradjohnson79@gmail.com)";
}

function pickCity(addr: Record<string, unknown> | null): string | null {
  if (!addr) return null;
  const v =
    addr.city ??
    addr.town ??
    addr.village ??
    addr.hamlet ??
    addr.municipality ??
    addr.county ??
    null;
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

function pickState(addr: Record<string, unknown> | null): string | null {
  if (!addr) return null;
  const v = addr.state ?? addr.state_code ?? addr.region ?? null;
  const s = typeof v === "string" ? v.trim() : "";
  const code = s.length === 2 ? s.toUpperCase() : s;
  return code || null;
}

function pickCountryCode(addr: Record<string, unknown> | null): "US" | "CA" | null {
  const cc = typeof addr?.country_code === "string" ? String(addr.country_code).trim().toUpperCase() : "";
  if (cc === "US" || cc === "CA") return cc;
  return null;
}

function pickHouseNumber(addr: Record<string, unknown> | null): string | null {
  const v = typeof addr?.house_number === "string" ? String(addr.house_number).trim() : "";
  return v || null;
}

function scoreResult(r: NominatimJsonV2, addr: Record<string, unknown> | null, country: "US" | "CA" | null): number {
  let score = 0;
  if (country === "CA") score += 15;
  if (country === "US") score += 10;
  if (pickHouseNumber(addr)) score += 50;
  const typ = String(r.type ?? "").toLowerCase();
  if (typ === "house") score += 30;
  return score;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = String(url.searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ ok: true, results: [] }, { status: 200 });

  const nom = new URL("https://nominatim.openstreetmap.org/search");
  nom.searchParams.set("format", "jsonv2");
  nom.searchParams.set("addressdetails", "1");
  nom.searchParams.set("limit", "8");
  nom.searchParams.set("q", q);
  nom.searchParams.set("countrycodes", "ca,us");
  nom.searchParams.set("dedupe", "1");
  nom.searchParams.set("polygon_geojson", "0");
  nom.searchParams.set("extratags", "0");
  nom.searchParams.set("namedetails", "0");
  nom.searchParams.set("accept-language", "en");

  const resp = await fetch(nom.toString(), {
    headers: { "User-Agent": ua(), Accept: "application/json" },
    cache: "no-store",
  });
  if (!resp.ok) return NextResponse.json({ ok: false, error: "Address search unavailable" }, { status: 424 });

  const json = (await resp.json().catch(() => null)) as NominatimJsonV2[] | null;
  const list = Array.isArray(json) ? json : [];
  const mapped = list
    .map((r) => {
      const display_name = String(r.display_name ?? "").trim();
      const lat = Number(r.lat);
      const lon = Number(r.lon);
      const addr = (r.address && typeof r.address === "object" ? (r.address as Record<string, unknown>) : null) ?? null;
      const country = pickCountryCode(addr);
      if (!display_name || !Number.isFinite(lat) || !Number.isFinite(lon) || !country) return null;
      return {
        _score: scoreResult(r, addr, country),
        place_id: r.place_id ?? null,
        display_name,
        lat,
        lon,
        address: {
          city: pickCity(addr),
          state: pickState(addr),
          postcode: typeof addr?.postcode === "string" ? String(addr.postcode).trim() : null,
          country,
        },
      };
    })
    .filter(Boolean) as any[];

  const results = mapped
    .sort((a, b) => Number(b._score) - Number(a._score))
    .slice(0, 8)
    .map(({ _score, ...rest }) => rest);

  return NextResponse.json({ ok: true, results }, { status: 200 });
}

