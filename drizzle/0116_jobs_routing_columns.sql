-- Jobs routing lifecycle columns (schema drift fix)
-- Production may be missing these if migrations 0102/0103 did not run.
-- All columns nullable TIMESTAMPTZ, no defaults, no backfill.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS routing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS routing_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_routed_at timestamptz,
  ADD COLUMN IF NOT EXISTS poster_accept_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS jobs_routing_expires_at_idx
  ON public.jobs(routing_expires_at);

CREATE INDEX IF NOT EXISTS jobs_poster_accept_expires_at_idx
  ON public.jobs(poster_accept_expires_at);
