-- Router V4: deterministic region matching for job filtering.
-- Add homeCountryCode and homeRegionCode (nullable for existing rows).

ALTER TABLE "router_profiles_v4" ADD COLUMN IF NOT EXISTS "home_country_code" text;
ALTER TABLE "router_profiles_v4" ADD COLUMN IF NOT EXISTS "home_region_code" text;
