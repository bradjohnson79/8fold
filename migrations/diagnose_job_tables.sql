-- =============================================================================
-- PHASE 1 — Read-only diagnostic: detect existing job tables
-- Run against production or target database. NO ALTERATIONS.
-- =============================================================================

-- 1) List all tables matching ILIKE '%job%' across schemas
SELECT
  table_schema,
  table_name,
  (SELECT count(*) FROM information_schema.columns c
   WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS column_count
FROM information_schema.tables t
WHERE table_name ILIKE '%job%'
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name;

-- 2) Row counts — uses DO block to safely query only existing tables
DO $$
DECLARE
  cnt bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    EXECUTE 'SELECT count(*) FROM public.jobs' INTO cnt;
    RAISE NOTICE 'public.jobs: % rows', cnt;
  ELSE
    RAISE NOTICE 'public.jobs: table does not exist';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Job') THEN
    EXECUTE 'SELECT count(*) FROM public."Job"' INTO cnt;
    RAISE NOTICE 'public."Job": % rows', cnt;
  ELSE
    RAISE NOTICE 'public."Job": table does not exist';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = '8fold_test')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '8fold_test' AND table_name = 'Job') THEN
    EXECUTE 'SELECT count(*) FROM "8fold_test"."Job"' INTO cnt;
    RAISE NOTICE '8fold_test."Job": % rows', cnt;
  ELSE
    RAISE NOTICE '8fold_test."Job": schema or table does not exist';
  END IF;
END $$;
