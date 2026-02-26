CREATE TABLE IF NOT EXISTS "public"."v4_tax_regions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "country_code" text NOT NULL,
  "region_code" text NOT NULL,
  "region_name" text NOT NULL,
  "combined_rate" numeric(8,6) NOT NULL DEFAULT 0,
  "gst_rate" numeric(8,6) NOT NULL DEFAULT 0,
  "pst_rate" numeric(8,6) NOT NULL DEFAULT 0,
  "hst_rate" numeric(8,6) NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "v4_tax_regions_country_region_idx" ON "public"."v4_tax_regions" ("country_code", "region_code");
CREATE INDEX IF NOT EXISTS "v4_tax_regions_active_idx" ON "public"."v4_tax_regions" ("active");

CREATE TABLE IF NOT EXISTS "public"."v4_tax_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "tax_mode" text NOT NULL DEFAULT 'EXCLUSIVE',
  "auto_apply_canada" boolean NOT NULL DEFAULT true,
  "apply_to_platform_fee" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "public"."v4_tax_settings" ("id", "tax_mode", "auto_apply_canada", "apply_to_platform_fee")
VALUES ('default', 'EXCLUSIVE', true, true)
ON CONFLICT ("id") DO NOTHING;
