ALTER TABLE IF EXISTS directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS outreach_status text NOT NULL DEFAULT 'pending';

ALTER TABLE IF EXISTS directory_engine.job_poster_leads
  ADD COLUMN IF NOT EXISTS outreach_status text NOT NULL DEFAULT 'pending';
