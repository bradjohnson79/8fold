ALTER TABLE IF EXISTS directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_reply_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS directory_engine.job_poster_leads
  ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processed_reply_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS directory_engine.lead_finder_domains
  ADD COLUMN IF NOT EXISTS reply_rate double precision NOT NULL DEFAULT 0;
