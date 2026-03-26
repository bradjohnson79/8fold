ALTER TABLE IF EXISTS directory_engine.discovery_domain_cache
  ADD COLUMN IF NOT EXISTS reachable boolean;

ALTER TABLE IF EXISTS directory_engine.discovery_domain_cache
  ADD COLUMN IF NOT EXISTS last_status_code integer;

ALTER TABLE IF EXISTS directory_engine.discovery_domain_cache
  ADD COLUMN IF NOT EXISTS last_content_type text;

ALTER TABLE IF EXISTS directory_engine.discovery_domain_cache
  ADD COLUMN IF NOT EXISTS last_response_time_ms integer;

ALTER TABLE IF EXISTS directory_engine.job_poster_leads
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'new';

UPDATE directory_engine.job_poster_leads
SET processing_status = CASE
  WHEN archived = true THEN 'processed'
  WHEN email IS NOT NULL AND btrim(email) <> '' THEN 'processed'
  WHEN needs_enrichment = true THEN 'enriching'
  ELSE 'new'
END
WHERE processing_status IS NULL
   OR btrim(processing_status) = '';
