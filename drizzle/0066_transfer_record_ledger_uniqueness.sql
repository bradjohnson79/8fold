-- TransferRecord: ensure unique(jobId, role) to prevent duplicate legs.
-- LedgerEntry: add unique(jobId, type, stripeRef) for webhook-driven entries where both are set.
-- Schema-agnostic: uses current_schema().

DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS "TransferRecord_job_role_uniq"
     ON %I."TransferRecord" ("jobId", "role")',
    s
  );
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_job_type_stripeRef_uniq"
     ON %I."LedgerEntry" ("jobId", "type", "stripeRef")
     WHERE "jobId" IS NOT NULL AND "stripeRef" IS NOT NULL',
    s
  );
END $$;
