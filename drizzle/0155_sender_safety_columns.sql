-- Add cooldown kill-switch and health score to sender_pool
ALTER TABLE directory_engine.sender_pool
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_score TEXT DEFAULT 'unknown';
