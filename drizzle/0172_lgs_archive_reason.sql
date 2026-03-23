ALTER TABLE IF EXISTS directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE IF EXISTS directory_engine.job_poster_leads
  ADD COLUMN IF NOT EXISTS archive_reason text;
