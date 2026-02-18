import { validateJobLocation } from "../pricing/validation";
import { geocodeCityCentroid, geocodeStreetAddress, regionToCityState } from "./geocode";

export type GeocodeResult = {
  lat: number;
  lng: number;
};

/**
 * Geocode an address or city/state to coordinates
 * Falls back to city centroid if address geocoding fails
 */
export async function geocodeAddress(
  address: string | null,
  city: string,
  stateProvince: string,
  country: "CA" | "US" = "US"
): Promise<GeocodeResult | null> {
  // If address provided, try address-level geocoding first.
  if (address && address.trim().length > 0) {
    const exact = await geocodeStreetAddress({
      street: address,
      city,
      state: stateProvince,
      country2: country,
    });
    if (exact) return exact;
  }

  // Fall back to city centroid
  const cityState = regionToCityState(`${city}-${stateProvince}`);
  if (!cityState) return null;

  const countryName = country === "CA" ? "Canada" : "United States";
  return await geocodeCityCentroid({
    city: cityState.city,
    state: cityState.state,
    country: countryName,
  });
}

/**
 * Validate job location matches profile location
 */
export function validateJobLocationMatchesProfile(
  jobProvince: string,
  profileProvince: string
): { valid: boolean; error?: string } {
  return validateJobLocation(jobProvince, profileProvince);
}
