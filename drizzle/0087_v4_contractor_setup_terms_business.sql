ALTER TABLE "public"."contractor_profiles_v4"
  ADD COLUMN IF NOT EXISTS "business_number" text;

ALTER TABLE "public"."contractor_profiles_v4"
  ADD COLUMN IF NOT EXISTS "started_trade_year" integer;

ALTER TABLE "public"."contractor_profiles_v4"
  ADD COLUMN IF NOT EXISTS "started_trade_month" integer;

ALTER TABLE "public"."contractor_profiles_v4"
  ADD COLUMN IF NOT EXISTS "accepted_tos_at" timestamp;

ALTER TABLE "public"."contractor_profiles_v4"
  ADD COLUMN IF NOT EXISTS "tos_version" text;

ALTER TABLE "public"."contractor_profiles_v4"
  ADD COLUMN IF NOT EXISTS "formatted_address" text;

ALTER TABLE "public"."contractor_profiles_v4"
  ADD COLUMN IF NOT EXISTS "postal_code" text;

ALTER TABLE "public"."contractor_profiles_v4"
  ADD COLUMN IF NOT EXISTS "country_code" text;
