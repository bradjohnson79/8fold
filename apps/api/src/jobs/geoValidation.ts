/**
 * Geo coordinate validation. Rejects (0,0) and invalid ranges.
 * Use before persisting coordinates to User, Contractor, Job, etc.
 */
export function validateGeoCoords(lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("INVALID_GEO_COORDINATES");
  }
  if (lat === 0 && lng === 0) {
    throw new Error("INVALID_GEO_COORDINATES");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("INVALID_GEO_COORDINATES");
  }
}

export function isValidGeo(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}
