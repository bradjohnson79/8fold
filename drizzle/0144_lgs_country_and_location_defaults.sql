-- LGS: Add country column and normalize existing website_import leads.
-- Safe to run multiple times (IF NOT EXISTS / COALESCE guarded).

-- 1. Add country column to contractor_leads
ALTER TABLE directory_engine.contractor_leads
  ADD COLUMN IF NOT EXISTS country text;

-- 2. Normalize existing website_import leads: fill empty city/state/country
UPDATE directory_engine.contractor_leads
SET
  city    = COALESCE(NULLIF(TRIM(city), ''),    'San Jose'),
  state   = COALESCE(NULLIF(TRIM(state), ''),   'CA'),
  country = COALESCE(NULLIF(TRIM(country), ''), 'US')
WHERE source = 'website_import';

-- 3. Any other leads missing country default to US
UPDATE directory_engine.contractor_leads
SET country = 'US'
WHERE country IS NULL OR TRIM(country) = '';
