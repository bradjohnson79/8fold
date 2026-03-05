-- Router Demo E2E Pack — Data normalization follow-up
-- Fixes country_code for all Canadian provinces, backfills Langley coords, adds DC to CHECK.
-- Does not modify router pipelines or Next.js routes.

-- Step A: Fix country_code for ALL Canadian provinces (0124 only fixed BC)
UPDATE jobs
SET country_code = 'CA'
WHERE region_code IN ('AB','SK','MB','ON','QC','NB','NS','PE','NL','YT','NT','NU')
AND country_code <> 'CA';

-- Step B: Backfill coordinates for Langley, BC jobs missing lat/lng (scoped safe)
UPDATE jobs
SET lat = 49.1044,
    lng = -122.6604
WHERE city ILIKE '%langley%'
  AND region_code = 'BC'
  AND country_code = 'CA'
  AND (lat IS NULL OR lng IS NULL);

-- Step C: Update CHECK constraint to include DC
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_region_code_valid;
ALTER TABLE jobs ADD CONSTRAINT jobs_region_code_valid
CHECK (
  region_code IS NULL
  OR region_code IN (
    'BC','AB','SK','MB','ON','QC','NB','NS','PE','NL','YT','NT','NU',
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC',
    'FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS',
    'MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV',
    'WI','WY'
  )
);
