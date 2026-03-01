ALTER TABLE IF EXISTS jobs
  ADD COLUMN IF NOT EXISTS appointment_at timestamptz;

ALTER TABLE IF EXISTS jobs
  ADD COLUMN IF NOT EXISTS appointment_published_at timestamptz;

CREATE INDEX IF NOT EXISTS jobs_appointment_at_idx
  ON jobs(appointment_at);
