/**
 * Creates a URL-friendly slug from text.
 * Handles: spaces, accents, special characters, case normalization.
 *
 * Examples:
 *   "New Westminster" → "new-westminster"
 *   "San José" → "san-jose"
 *   "British Columbia" → "british-columbia"
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD") // Decompose accented characters (é → e + ́)
    .replace(/[\u0300-\u036f]/g, "") // Remove combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, ""); // Trim leading/trailing hyphens
}

/**
 * Slugify a city name for URL paths.
 */
export function slugCity(city: string): string {
  return slugify(city);
}

/**
 * Slugify a region name for URL paths.
 */
export function slugRegion(regionName: string): string {
  return slugify(regionName);
}

/**
 * Converts a slug back to Title Case for display/API.
 * Example: "new-westminster" → "New Westminster"
 */
export function slugToTitleCase(slug: string): string {
  return slug
    .trim()
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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