-- Router profile coordinates are not used for routing logic.
-- Make them nullable to avoid storing placeholder values.
ALTER TABLE router_profiles_v4
  ALTER COLUMN home_latitude DROP NOT NULL,
  ALTER COLUMN home_longitude DROP NOT NULL;
