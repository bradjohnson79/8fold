ALTER TABLE IF EXISTS v4_contractor_job_invites
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE v4_contractor_job_invites
SET expires_at = coalesce(created_at, now()) + interval '24 hours'
WHERE expires_at IS NULL;

ALTER TABLE IF EXISTS v4_contractor_job_invites
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE IF EXISTS jobs
  ADD COLUMN IF NOT EXISTS routing_started_at timestamptz;

ALTER TABLE IF EXISTS jobs
  ADD COLUMN IF NOT EXISTS routing_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS v4_contractor_job_invites_expires_idx
  ON v4_contractor_job_invites(expires_at);

CREATE INDEX IF NOT EXISTS jobs_routing_expires_at_idx
  ON jobs(routing_expires_at);

CREATE OR REPLACE VIEW v4_job_invites AS
SELECT
  id,
  job_id,
  contractor_user_id AS contractor_id,
  route_id AS router_id,
  status,
  created_at,
  expires_at,
  responded_at
FROM v4_contractor_job_invites;
