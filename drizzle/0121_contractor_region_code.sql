-- Add home_region_code to contractor_profiles_v4 for jurisdiction-first matching.
-- Single source: contractor_profiles_v4.country_code + home_region_code (no contractor_accounts).

ALTER TABLE contractor_profiles_v4
  ADD COLUMN IF NOT EXISTS home_region_code text;

-- Backfill from contractor_accounts (legacy source)
UPDATE contractor_profiles_v4 cp
SET home_region_code = ca."regionCode"
FROM contractor_accounts ca
WHERE ca."userId" = cp.user_id
  AND cp.home_region_code IS NULL
  AND ca."regionCode" IS NOT NULL;
