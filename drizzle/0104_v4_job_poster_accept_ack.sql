ALTER TABLE IF EXISTS jobs
  ADD COLUMN IF NOT EXISTS poster_accepted_at timestamptz;

CREATE INDEX IF NOT EXISTS jobs_poster_accepted_at_idx
  ON jobs(poster_accepted_at);
