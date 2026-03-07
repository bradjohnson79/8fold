-- Add routing and accept columns to jobs (safe with IF NOT EXISTS)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS routing_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS routing_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS first_routed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS poster_accept_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS jobs_routing_expires_at_idx ON jobs(routing_expires_at);
CREATE INDEX IF NOT EXISTS jobs_poster_accept_expires_at_idx ON jobs(poster_accept_expires_at);
