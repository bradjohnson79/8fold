-- Migration 0146: Add email warmup tracking to sender_pool
-- Tracks warmup state, daily progress, and inbox placement health per sender.

ALTER TABLE directory_engine.sender_pool
  ADD COLUMN IF NOT EXISTS warmup_status          text    NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS warmup_started_at      timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_day             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_emails_sent_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_total_replies   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_total_sent      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_inbox_placement text             DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS updated_at             timestamptz NOT NULL DEFAULT now();

-- Constraint: warmup_status must be one of the known values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sender_pool_warmup_status_check'
  ) THEN
    ALTER TABLE directory_engine.sender_pool
      ADD CONSTRAINT sender_pool_warmup_status_check
      CHECK (warmup_status IN ('not_started','warming','ready','paused'));
  END IF;
END $$;
