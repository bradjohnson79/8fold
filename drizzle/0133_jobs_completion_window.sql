ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS completion_window_expires_at TIMESTAMP;
