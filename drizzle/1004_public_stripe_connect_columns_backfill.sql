-- Backfill Stripe Connect columns on legacy tables in public schema.
-- Fixes drift where earlier migration 0011 may have executed against non-public schema.

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', current_schema()] LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = s
        AND table_name = 'Contractor'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I."Contractor"
           ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" boolean NOT NULL DEFAULT false,
           ADD COLUMN IF NOT EXISTS "stripeAccountId" text',
        s
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS "Contractor_stripeAccountId_idx"
           ON %I."Contractor" ("stripeAccountId")',
        s
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = s
        AND table_name = 'RouterProfile'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I."RouterProfile"
           ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" boolean NOT NULL DEFAULT false,
           ADD COLUMN IF NOT EXISTS "stripeAccountId" text',
        s
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS "RouterProfile_stripeAccountId_idx"
           ON %I."RouterProfile" ("stripeAccountId")',
        s
      );
    END IF;
  END LOOP;
END $$;
