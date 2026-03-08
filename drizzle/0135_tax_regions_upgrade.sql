-- Tax Regions Upgrade: numeric(6,3) for percentage storage, unique constraint
-- combined_rate stored as percentage (e.g. 12.000 = 12%, 14.975 = 14.975%)
-- Migrate existing decimal values (0.12) to percentage (12.000)

-- Step 1: Convert existing decimal rates to percentage (0.12 -> 12, 0.14975 -> 14.975)
-- Only convert values in (0, 1) range (decimal format); leave 0 and already-percentage values
UPDATE public.v4_tax_regions
SET combined_rate = combined_rate * 100
WHERE combined_rate > 0 AND combined_rate < 1;

-- Step 2: Alter column type to numeric(6,3)
ALTER TABLE public.v4_tax_regions
  ALTER COLUMN combined_rate TYPE numeric(6,3) USING combined_rate::numeric(6,3);

-- Step 3: Add UNIQUE constraint on (country_code, region_code)
ALTER TABLE public.v4_tax_regions
  ADD CONSTRAINT v4_tax_regions_country_region_unique UNIQUE (country_code, region_code);
