ALTER TABLE IF EXISTS "public"."v4_notifications"
  ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN IF NOT EXISTS "message" text,
  ADD COLUMN IF NOT EXISTS "entity_type" text,
  ADD COLUMN IF NOT EXISTS "entity_id" text,
  ADD COLUMN IF NOT EXISTS "read" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "priority" text NOT NULL DEFAULT 'NORMAL';

-- Backfill new fields from legacy columns when present.
UPDATE "public"."v4_notifications"
SET
  "message" = coalesce("message", "body", ''),
  "entity_type" = coalesce("entity_type", case when "job_id" is not null then 'JOB' else 'SYSTEM' end),
  "entity_id" = coalesce("entity_id", coalesce("job_id", "id")),
  "read" = coalesce("read", "read_at" is not null),
  "priority" = coalesce(nullif("priority", ''), 'NORMAL')
WHERE true;

ALTER TABLE "public"."v4_notifications"
  ALTER COLUMN "message" SET NOT NULL,
  ALTER COLUMN "entity_type" SET NOT NULL,
  ALTER COLUMN "entity_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "v4_notifications_user_idx" ON "public"."v4_notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "v4_notifications_read_idx" ON "public"."v4_notifications" ("read");
CREATE INDEX IF NOT EXISTS "v4_notifications_priority_idx" ON "public"."v4_notifications" ("priority");
CREATE INDEX IF NOT EXISTS "v4_notifications_created_idx" ON "public"."v4_notifications" ("created_at");
