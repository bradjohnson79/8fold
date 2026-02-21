-- P&M hardening: uniqueness + concurrency safety
DO $$
DECLARE
  s TEXT := current_schema();
BEGIN
  -- Enforce single active PM request per job:
  -- only one request may exist outside terminal states.
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS "PmRequest_one_active_per_job_uq"
       ON %I."PmRequest" ("jobId")
       WHERE "status" NOT IN (''RELEASED'', ''CLOSED'', ''REJECTED'')',
    s
  );

  -- Ensure only one payout row can exist per pmRequestId.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'ContractorPayout' AND column_name = 'pmRequestId'
  ) THEN
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS "ContractorPayout_pmRequestId_uq"
         ON %I."ContractorPayout" ("pmRequestId")
         WHERE "pmRequestId" IS NOT NULL',
      s
    );
  END IF;
END $$;
