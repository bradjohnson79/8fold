-- Jobs execution/appointment columns (schema drift fix)
-- Production may be missing these if older migrations were not applied.
-- All columns nullable TIMESTAMPTZ, no defaults, no backfill.
-- Table name unqualified; respects search_path (public for prod, schema param for test).

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS appointment_published_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS appointment_accepted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS contractor_marked_complete_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS poster_marked_complete_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS jobs_appointment_at_idx ON jobs(appointment_at);
