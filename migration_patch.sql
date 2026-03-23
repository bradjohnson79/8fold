ALTER TABLE IF EXISTS directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS address text,
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

ALTER TABLE IF EXISTS directory_engine.contractor_leads
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE IF EXISTS directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE IF EXISTS directory_engine.job_poster_leads
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE IF EXISTS directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_reply_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS directory_engine.job_poster_leads
  ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_reply_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS directory_engine.lead_finder_domains
  ADD COLUMN IF NOT EXISTS reply_rate double precision NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS directory_engine.job_poster_leads
  ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0;
