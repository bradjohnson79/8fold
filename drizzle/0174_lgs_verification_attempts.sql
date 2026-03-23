ALTER TABLE IF EXISTS directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS directory_engine.job_poster_leads
  ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0;
