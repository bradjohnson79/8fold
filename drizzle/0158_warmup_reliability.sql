-- 0158: Warmup reliability upgrade — exact timing, activity log, worker health
-- Adds observability columns to sender_pool, creates activity and health tables.

ALTER TABLE directory_engine.sender_pool
  ADD COLUMN IF NOT EXISTS next_warmup_send_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_warmup_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_warmup_result TEXT,
  ADD COLUMN IF NOT EXISTS last_warmup_recipient TEXT;

CREATE TABLE IF NOT EXISTS directory_engine.lgs_warmup_activity (
  id              SERIAL PRIMARY KEY,
  sender_email    TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject         TEXT,
  message_type    TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warmup_activity_sent_at
  ON directory_engine.lgs_warmup_activity (sent_at DESC);

CREATE TABLE IF NOT EXISTS directory_engine.lgs_worker_health (
  id                    SERIAL PRIMARY KEY,
  worker_name           TEXT NOT NULL UNIQUE,
  last_heartbeat_at     TIMESTAMPTZ,
  last_run_started_at   TIMESTAMPTZ,
  last_run_finished_at  TIMESTAMPTZ,
  last_run_status       TEXT,
  last_error            TEXT,
  config_check_result   JSONB
);

INSERT INTO directory_engine.lgs_worker_health (worker_name)
  VALUES ('warmup') ON CONFLICT (worker_name) DO NOTHING;
