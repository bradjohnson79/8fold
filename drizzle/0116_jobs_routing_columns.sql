-- Jobs routing lifecycle columns (schema drift fix)
-- Production may be missing these if migrations 0102/0103 did not run.
-- All columns nullable TIMESTAMPTZ, no defaults, no backfill.
-- Table name unqualified; respects search_path (public for prod, schema param for test).

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS routing_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS routing_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS first_routed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS poster_accept_expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS jobs_routing_expires_at_idx ON jobs(routing_expires_at);
CREATE INDEX IF NOT EXISTS jobs_poster_accept_expires_at_idx ON jobs(poster_accept_expires_at);
