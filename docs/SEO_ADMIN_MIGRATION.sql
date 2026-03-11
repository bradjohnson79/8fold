-- Migration: Admin SEO Template & Control System
-- Run this against your database before deploying the new schema.
--
-- Option 1 (no psql): pnpm -C apps/api exec tsx scripts/run-seo-admin-migration.ts
-- Option 2 (with psql): psql $DATABASE_URL -f docs/SEO_ADMIN_MIGRATION.sql
--
-- Part 1: Add columns to seo_settings (if not exists)
ALTER TABLE seo_settings
  ADD COLUMN IF NOT EXISTS enable_google_indexing BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_index_now BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_index_new_jobs BOOLEAN DEFAULT true;

-- Part 2: Create seo_templates table
CREATE TABLE IF NOT EXISTS seo_templates (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  template_key TEXT NOT NULL UNIQUE,
  title_template TEXT NOT NULL,
  description_template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS seo_templates_template_key_uq ON seo_templates (template_key);

-- Part 3: Seed initial templates
INSERT INTO seo_templates (template_key, title_template, description_template)
VALUES
  ('job_page', '{job_title} in {city}, {region} | 8Fold', 'Find trusted {trade} professionals in {city}. Post your job on 8Fold and connect with local contractors today.'),
  ('contractor_profile', '{contractor_name} — {trade} Contractor | 8Fold', '{contractor_name} is a verified {trade} contractor available on 8Fold.'),
  ('location_page', 'Local {trade} in {city}, {region} | 8Fold', 'Find trusted {trade} professionals in {city}. Post your job on 8Fold and connect with local contractors today.'),
  ('service_page', '{trade} Services | Hire Local Contractors | 8Fold', 'Find trusted {trade} professionals near you. Connect with skilled local trades through 8Fold.')
ON CONFLICT (template_key) DO NOTHING;
