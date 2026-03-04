import { REGION_OPTIONS } from "@/lib/regions";
import { slugify } from "@/utils/slug";

export type RegionResolution = {
  country: "US" | "CA";
  regionCode: string;
  regionName: string;
};

/**
 * Converts a region name to a URL slug.
 * Handles accents and spaces safely.
 * Example: "British Columbia" → "british-columbia"
 */
export function slugRegion(regionName: string): string {
  return slugify(regionName);
}

/**
 * Resolves a region slug or region code into
 * a canonical region object.
 *
 * Examples:
 *  "alabama" → { country: "US", regionCode: "AL" }
 *  "AL" → { country: "US", regionCode: "AL" }
 *  "british-columbia" → { country: "CA", regionCode: "BC" }
 */
export function resolveRegionSlug(slug: string): RegionResolution | null {
  const normalizedSlug = slug.trim().toLowerCase();

  const normalizedName = normalizedSlug.replace(/-/g, " ");

  // Check US states
  for (const region of REGION_OPTIONS.US) {
    const regionNameSlug = slugRegion(region.name);
    if (
      regionNameSlug === normalizedSlug ||
      region.code.toLowerCase() === normalizedSlug ||
      region.name.toLowerCase() === normalizedName
    ) {
      return {
        country: "US",
        regionCode: region.code,
        regionName: region.name,
      };
    }
  }

  // Check Canadian provinces
  for (const region of REGION_OPTIONS.CA) {
    const regionNameSlug = slugRegion(region.name);
    if (
      regionNameSlug === normalizedSlug ||
      region.code.toLowerCase() === normalizedSlug ||
      region.name.toLowerCase() === normalizedName
    ) {
      return {
        country: "CA",
        regionCode: region.code,
        regionName: region.name,
      };
    }
  }

  return null;
}