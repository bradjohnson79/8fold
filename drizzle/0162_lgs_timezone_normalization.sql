ALTER TABLE directory_engine.sender_pool
  ALTER COLUMN gmail_token_expires_at TYPE TIMESTAMPTZ USING gmail_token_expires_at AT TIME ZONE 'UTC',
  ALTER COLUMN warmup_interval_anchor_at TYPE TIMESTAMPTZ USING warmup_interval_anchor_at AT TIME ZONE 'UTC',
  ALTER COLUMN warmup_sending_at TYPE TIMESTAMPTZ USING warmup_sending_at AT TIME ZONE 'UTC';

ALTER TABLE directory_engine.warmup_system_state
  ALTER COLUMN last_worker_run_at TYPE TIMESTAMPTZ USING last_worker_run_at AT TIME ZONE 'UTC',
  ALTER COLUMN last_successful_send_at TYPE TIMESTAMPTZ USING last_successful_send_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
