import { REGION_OPTIONS } from "@/lib/regions";

type RegionResolution = {
  country: "US" | "CA";
  regionCode: string;
  regionName: string;
};

const US_CODES = new Set(REGION_OPTIONS.US.map((r) => r.code));
const CA_CODES = new Set(REGION_OPTIONS.CA.map((r) => r.code));

/**
 * Resolves a URL slug like "alabama" or "british-columbia" to a region code.
 * Returns null if the slug cannot be resolved.
 */
export function resolveRegionSlug(slug: string): RegionResolution | null {
  const normalized = slug.trim().toLowerCase().replace(/-/g, " ");

  // Try US states first
  for (const region of REGION_OPTIONS.US) {
    const nameNormalized = region.name.toLowerCase();
    if (nameNormalized === normalized || region.code.toLowerCase() === slug.toLowerCase()) {
      return {
        country: "US",
        regionCode: region.code,
        regionName: region.name,
      };
    }
  }

  // Try CA provinces
  for (const region of REGION_OPTIONS.CA) {
    const nameNormalized = region.name.toLowerCase();
    if (nameNormalized === normalized || region.code.toLowerCase() === slug.toLowerCase()) {
      return {
        country: "CA",
        regionCode: region.code,
        regionName: region.name,
      };
    }
  }

  return null;
}

/**
 * Creates a URL-friendly slug from a region name.
 * Example: "British Columbia" → "british-columbia"
 */
export function slugifyRegion(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
