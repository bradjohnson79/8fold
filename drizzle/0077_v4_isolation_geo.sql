-- V4 isolated readiness + geolocation substrate.

CREATE TABLE IF NOT EXISTS "job_poster_profiles_v4" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "address_line1" text NOT NULL,
  "address_line2" text,
  "city" text NOT NULL,
  "province_state" text NOT NULL,
  "postal_code" text NOT NULL,
  "country" text NOT NULL,
  "formatted_address" text NOT NULL,
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "geocode_provider" text NOT NULL DEFAULT 'OSM',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "job_poster_profiles_v4_user_id_uidx" ON "job_poster_profiles_v4" ("user_id");

CREATE TABLE IF NOT EXISTS "contractor_profiles_v4" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contact_name" text NOT NULL,
  "phone" text NOT NULL,
  "business_name" text NOT NULL,
  "trade_categories" jsonb NOT NULL,
  "service_radius_km" integer NOT NULL,
  "home_latitude" double precision NOT NULL,
  "home_longitude" double precision NOT NULL,
  "stripe_connected" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "contractor_profiles_v4_user_id_uidx" ON "contractor_profiles_v4" ("user_id");

CREATE TABLE IF NOT EXISTS "router_profiles_v4" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contact_name" text NOT NULL,
  "phone" text NOT NULL,
  "home_region" text NOT NULL,
  "service_areas" jsonb NOT NULL,
  "availability" jsonb NOT NULL,
  "home_latitude" double precision NOT NULL,
  "home_longitude" double precision NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "router_profiles_v4_user_id_uidx" ON "router_profiles_v4" ("user_id");

CREATE TABLE IF NOT EXISTS "v4_job_uploads" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "sha256" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "used_at" timestamp
);
CREATE INDEX IF NOT EXISTS "v4_job_uploads_user_created_idx" ON "v4_job_uploads" ("user_id","created_at");

CREATE TABLE IF NOT EXISTS "v4_appraisal_token_consumptions" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "consumed_at" timestamp NOT NULL DEFAULT now(),
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "v4_appraisal_token_consumptions_user_idx" ON "v4_appraisal_token_consumptions" ("user_id","consumed_at");

-- Canonical jobs geo indexes for deterministic geo reads.
CREATE INDEX IF NOT EXISTS "jobs_lat_idx" ON "jobs" ("lat");
CREATE INDEX IF NOT EXISTS "jobs_lng_idx" ON "jobs" ("lng");
