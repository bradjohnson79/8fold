-- Add rolling 24-hour warmup columns and outreach_enabled flag to sender_pool
ALTER TABLE directory_engine.sender_pool
  ADD COLUMN IF NOT EXISTS current_day_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outreach_sent_today INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_sent_today INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outreach_enabled BOOLEAN NOT NULL DEFAULT false;
