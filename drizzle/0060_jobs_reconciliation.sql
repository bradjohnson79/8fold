-- Jobs reconciliation: drop legacy columns, add indexes, normalize timestamps.
-- Run after schema-reconciliation branch. Idempotent.

-- Phase 2: Drop legacy columns (ghosts from pre-0054)
ALTER TABLE jobs DROP COLUMN IF EXISTS amountcents;
ALTER TABLE jobs DROP COLUMN IF EXISTS paymentstatus;
ALTER TABLE jobs DROP COLUMN IF EXISTS publicstatus;

-- Phase 3: Add critical indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_routing_status ON jobs(routing_status);
CREATE INDEX IF NOT EXISTS idx_jobs_payout_status ON jobs(payout_status);
CREATE INDEX IF NOT EXISTS idx_jobs_archived ON jobs(archived);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

-- Phase 3b: Normalize timestamps to timestamptz (naive -> UTC)
-- Only alter when column is timestamp without time zone (data_type = 'timestamp without time zone')
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'jobs'
    AND column_name IN ('created_at', 'published_at', 'claimed_at', 'routed_at')
    AND data_type = 'timestamp without time zone'
  ) LOOP
    EXECUTE format(
      'ALTER TABLE jobs ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
      r.column_name, r.column_name
    );
  END LOOP;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Timestamp normalization skipped or partial: %', SQLERRM;
END $$;
