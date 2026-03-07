ALTER TABLE v4_notifications
ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS v4_notifications_dedupe_key_uq
ON v4_notifications(dedupe_key)
WHERE dedupe_key IS NOT NULL;
