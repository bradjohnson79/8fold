-- Router Jobs Data Normalization
-- Normalize legacy job records: routing_status NULL, invalid region_code, country_code mismatch.
-- Does not modify router pipelines or Next.js routes.

-- Step 1a: Backfill routing_status
UPDATE jobs
SET routing_status = 'UNROUTED'
WHERE routing_status IS NULL;

-- Step 1b: Normalize Canadian region names to ISO codes
UPDATE jobs
SET region_code = 'BC'
WHERE upper(trim(coalesce(region_code, ''))) IN (
  'BRITISH CO',
  'BRITISH COLUMBIA'
);

-- Step 1c: Fix country_code for Canadian regions (BC jobs should be CA)
UPDATE jobs
SET country_code = 'CA'
WHERE region_code = 'BC'
AND country_code <> 'CA';

-- Step 2: Add region validation constraint (allows NULL for unset regions)
-- Prevents invalid region values from entering the database.
ALTER TABLE jobs
ADD CONSTRAINT jobs_region_code_valid
CHECK (
  region_code IS NULL
  OR region_code IN (
    'BC','AB','SK','MB','ON','QC',
    'NB','NS','PE','NL','YT','NT','NU',
    'AL','AK','AZ','AR','CA','CO','CT','DE',
    'FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS',
    'MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV',
    'WI','WY'
  )
);

-- Step 3: Diagnostic query for jobs missing coordinates (do not auto-modify)
-- Jobs missing coordinates must be re-geocoded through the job edit process.
-- Coordinates should always originate from the geocoder.
--
-- SELECT id, title, city, region_code
-- FROM jobs
-- WHERE lat IS NULL OR lng IS NULL;
