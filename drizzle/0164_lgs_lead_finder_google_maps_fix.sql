ALTER TABLE IF EXISTS directory_engine.lead_finder_domains
  ALTER COLUMN domain DROP NOT NULL;

ALTER TABLE IF EXISTS directory_engine.lead_finder_domains
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS place_id text;

CREATE UNIQUE INDEX IF NOT EXISTS lead_finder_domains_campaign_place_id_uniq
  ON directory_engine.lead_finder_domains (campaign_id, place_id)
  WHERE place_id IS NOT NULL;
