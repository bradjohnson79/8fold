import { slugify } from "@/utils/slug";
import { REGION_OPTIONS } from "@/lib/regions";

export type RegionResolution = {
  country: "US" | "CA";
  regionCode: string;
  regionName?: string;
};

/**
 * Converts a region name to a URL slug.
 * Uses slugify for accent normalization.
 */
export function regionNameToSlug(regionName: string): string {
  return slugify(regionName);
}

/**
 * Resolves a URL slug to region code and country.
 * Deterministic, no network calls.
 * Returns null for unknown slugs.
 */
export function resolveRegionSlug(regionSlug: string): RegionResolution | null {
  const slug = regionSlug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!slug) return null;

  for (const region of REGION_OPTIONS.US) {
    const nameSlug = regionNameToSlug(region.name);
    const codeSlug = region.code.toLowerCase();
    if (nameSlug === slug || codeSlug === slug) {
      return {
        country: "US",
        regionCode: region.code,
        regionName: region.name,
      };
    }
  }

  for (const region of REGION_OPTIONS.CA) {
    const nameSlug = regionNameToSlug(region.name);
    const codeSlug = region.code.toLowerCase();
    if (nameSlug === slug || codeSlug === slug) {
      return {
        country: "CA",
        regionCode: region.code,
        regionName: region.name,
      };
    }
  }

  return null;
}
