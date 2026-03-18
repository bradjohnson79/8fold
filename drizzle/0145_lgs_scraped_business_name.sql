-- Migration 0145: Add scraped_business_name to contractor_leads
-- Preserves the raw scraped value before any cleaning or manual edits.

ALTER TABLE directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS scraped_business_name text;

-- Backfill: copy current business_name into scraped_business_name
-- so existing rows have the original scraped value recorded.
UPDATE directory_engine.contractor_leads
SET scraped_business_name = business_name
WHERE scraped_business_name IS NULL
  AND business_name IS NOT NULL;
