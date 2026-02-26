ALTER TABLE "public"."contractor_profiles_v4"
  ADD COLUMN IF NOT EXISTS "street_address" text;
