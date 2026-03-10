/**
 * Slug utilities for API — must match apps/web/src/utils/slug.ts rules.
 * lowercase, spaces → hyphen, remove special characters (except hyphen).
 */

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/** Maps trade_category enum to URL slug. HANDYMAN → handyman, FURNITURE_ASSEMBLY → furniture-assembly */
export function tradeCategoryToSlug(tc: string): string {
  return slugify(tc.replace(/_/g, " "));
}

/** Reverse: slug → trade_category for DB query */
export function slugToTradeCategory(slug: string): string | null {
  const map: Record<string, string> = {
    handyman: "HANDYMAN",
    plumbing: "PLUMBING",
    electrical: "ELECTRICAL",
    hvac: "HVAC",
    appliance: "APPLIANCE",
    painting: "PAINTING",
    carpentry: "CARPENTRY",
    drywall: "DRYWALL",
    roofing: "ROOFING",
    "janitorial-cleaning": "JANITORIAL_CLEANING",
    landscaping: "LANDSCAPING",
    fencing: "FENCING",
    "snow-removal": "SNOW_REMOVAL",
    "junk-removal": "JUNK_REMOVAL",
    moving: "MOVING",
    automotive: "AUTOMOTIVE",
    "furniture-assembly": "FURNITURE_ASSEMBLY",
    welding: "WELDING",
    "jack-of-all-trades": "JACK_OF_ALL_TRADES",
  };
  return map[slug] ?? null;
}
