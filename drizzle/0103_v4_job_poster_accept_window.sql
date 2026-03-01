ALTER TABLE IF EXISTS jobs
  ADD COLUMN IF NOT EXISTS poster_accept_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS jobs_poster_accept_expires_at_idx
  ON jobs(poster_accept_expires_at);
