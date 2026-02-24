-- =============================================================================
-- PHASE 6 — Cleanup: Drop legacy backup table
--
-- Run ONLY after:
-- - Data copied to public.jobs
-- - Row counts match
-- - API returns 200 on /api/public/jobs/recent
-- - Homepage loads correctly
--
-- Drops _Job_legacy_backup only if no foreign key references exist.
-- =============================================================================

BEGIN;

-- Verify public.jobs exists and has data (safety check)
DO $$
DECLARE
  cnt bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    RAISE EXCEPTION 'public.jobs does not exist. Abort drop.';
  END IF;
  EXECUTE 'SELECT count(*) FROM public.jobs' INTO cnt;
  IF cnt = 0 THEN
    RAISE EXCEPTION 'public.jobs has 0 rows. Abort drop. Verify migration first.';
  END IF;
END $$;

-- Drop legacy backup if it exists and has no dependent objects
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_Job_legacy_backup') THEN
    RAISE NOTICE 'public._Job_legacy_backup does not exist. Nothing to drop.';
    RETURN;
  END IF;

  -- Check for foreign key references (constraints pointing TO this table)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public' AND ccu.table_name = '_Job_legacy_backup'
  ) THEN
    RAISE EXCEPTION 'Foreign key references exist to _Job_legacy_backup. Resolve before dropping.';
  END IF;

  DROP TABLE IF EXISTS public._Job_legacy_backup;
  RAISE NOTICE 'Dropped public._Job_legacy_backup';
END $$;

COMMIT;
