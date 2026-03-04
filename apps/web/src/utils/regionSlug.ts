import { stateProvinceMap } from "@8fold/shared";

const US_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

const CA_CODES = ["AB", "BC", "MB", "NB", "NL", "NS", "ON", "PE", "QC", "SK"] as const;

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Build slug -> { country, regionCode } map for all US states + CA provinces. */
const SLUG_TO_REGION = (() => {
  const map = new Map<string, { country: "US" | "CA"; regionCode: string }>();
  for (const code of US_CODES) {
    const name = (stateProvinceMap as Record<string, string>)[code];
    if (name) map.set(slugify(name), { country: "US", regionCode: code });
  }
  for (const code of CA_CODES) {
    const name = (stateProvinceMap as Record<string, string>)[code];
    if (name) map.set(slugify(name), { country: "CA", regionCode: code });
  }
  return map;
})();

/** Region name (e.g. "Alabama") -> slug (e.g. "alabama"). */
export function regionNameToSlug(regionName: string): string {
  return slugify(regionName);
}

/** Resolve region slug to country + regionCode. Returns null if unknown. */
export function resolveRegionSlug(slug: string): { country: "US" | "CA"; regionCode: string } | null {
  const normalized = slug.trim().toLowerCase().replace(/\s+/g, "-");
  return SLUG_TO_REGION.get(normalized) ?? null;
}
