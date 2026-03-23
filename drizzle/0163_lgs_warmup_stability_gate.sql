ALTER TABLE directory_engine.sender_pool
ADD COLUMN IF NOT EXISTS warmup_stability_verified BOOLEAN DEFAULT false;

ALTER TABLE directory_engine.sender_pool
ADD COLUMN IF NOT EXISTS warmup_stability_started_at TIMESTAMPTZ;

UPDATE directory_engine.sender_pool
SET
  warmup_stability_verified = COALESCE(warmup_stability_verified, false),
  outreach_enabled = false
WHERE COALESCE(warmup_day, 0) >= 5
  AND COALESCE(warmup_stability_verified, false) = false;
