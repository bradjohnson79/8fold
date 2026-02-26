ALTER TABLE contractor_profiles_v4
  ADD COLUMN IF NOT EXISTS street_address text;

ALTER TABLE contractor_profiles_v4
  ALTER COLUMN service_radius_km SET DEFAULT 25;
