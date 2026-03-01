ALTER TABLE IF EXISTS v4_contractor_job_invites
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

ALTER TABLE IF EXISTS v4_contractor_job_invites
  ALTER COLUMN status SET DEFAULT 'PENDING';

-- Existing status column is text; allow EXPIRED without enum migration.
-- Keep explicit indexes for query-path guarantees.
CREATE INDEX IF NOT EXISTS v4_contractor_job_invites_job_idx
  ON v4_contractor_job_invites(job_id);

CREATE INDEX IF NOT EXISTS v4_contractor_job_invites_contractor_idx
  ON v4_contractor_job_invites(contractor_user_id);

CREATE INDEX IF NOT EXISTS v4_contractor_job_invites_status_idx
  ON v4_contractor_job_invites(status);

-- Back-compat alias for external callers expecting v4_job_invites naming.
DO $$
BEGIN
  IF to_regclass('public.v4_job_invites') IS NULL THEN
    EXECUTE '
      CREATE VIEW v4_job_invites AS
      SELECT
        id,
        job_id,
        contractor_user_id AS contractor_id,
        route_id AS router_id,
        status,
        created_at,
        responded_at
      FROM v4_contractor_job_invites
    ';
  END IF;
END
$$;
