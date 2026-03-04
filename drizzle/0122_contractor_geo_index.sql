-- Geo index for jurisdiction-first contractor discovery.
-- Order: country_code, home_region_code, home_latitude, home_longitude.
-- Allows PostgreSQL to prune by jurisdiction before scanning coordinates.

CREATE INDEX IF NOT EXISTS idx_contractor_profiles_v4_geo
  ON contractor_profiles_v4 (
    country_code,
    home_region_code,
    home_latitude,
    home_longitude
  );
