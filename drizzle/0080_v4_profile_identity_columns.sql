-- V4 profile identity columns (Clerk sync). Nullable; backfilled on first profile save only.
-- Identity ≠ readiness; these columns are for display/historical snapshot only.

ALTER TABLE "job_poster_profiles_v4" ADD COLUMN IF NOT EXISTS "first_name" text;
ALTER TABLE "job_poster_profiles_v4" ADD COLUMN IF NOT EXISTS "last_name" text;
ALTER TABLE "job_poster_profiles_v4" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "job_poster_profiles_v4" ADD COLUMN IF NOT EXISTS "avatar_url" text;

ALTER TABLE "router_profiles_v4" ADD COLUMN IF NOT EXISTS "first_name" text;
ALTER TABLE "router_profiles_v4" ADD COLUMN IF NOT EXISTS "last_name" text;
ALTER TABLE "router_profiles_v4" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "router_profiles_v4" ADD COLUMN IF NOT EXISTS "avatar_url" text;

ALTER TABLE "contractor_profiles_v4" ADD COLUMN IF NOT EXISTS "first_name" text;
ALTER TABLE "contractor_profiles_v4" ADD COLUMN IF NOT EXISTS "last_name" text;
ALTER TABLE "contractor_profiles_v4" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "contractor_profiles_v4" ADD COLUMN IF NOT EXISTS "avatar_url" text;
