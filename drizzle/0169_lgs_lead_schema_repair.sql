ALTER TABLE IF EXISTS directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS needs_enrichment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assignment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outreach_status text NOT NULL DEFAULT 'pending';

ALTER TABLE IF EXISTS directory_engine.job_poster_leads
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS trade text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS needs_enrichment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assignment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outreach_status text NOT NULL DEFAULT 'pending';
