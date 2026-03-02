ALTER TABLE IF EXISTS "v4_message_threads"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "ended_at" timestamptz;

CREATE INDEX IF NOT EXISTS "v4_message_threads_status_idx"
  ON "v4_message_threads" ("status");

ALTER TABLE IF EXISTS "v4_messages"
  ADD COLUMN IF NOT EXISTS "thread_id" text REFERENCES "v4_message_threads"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "sender_role" text NOT NULL DEFAULT 'SYSTEM';

ALTER TABLE IF EXISTS "v4_messages"
  ALTER COLUMN "from_user_id" DROP NOT NULL,
  ALTER COLUMN "to_user_id" DROP NOT NULL;

UPDATE "v4_messages" AS m
SET "thread_id" = t."id"
FROM "v4_message_threads" AS t
WHERE m."thread_id" IS NULL
  AND m."job_id" = t."job_id"
  AND (
    (m."from_user_id" = t."job_poster_user_id" AND m."to_user_id" = t."contractor_user_id")
    OR
    (m."from_user_id" = t."contractor_user_id" AND m."to_user_id" = t."job_poster_user_id")
  );

UPDATE "v4_messages" AS m
SET "sender_role" = CASE
  WHEN m."from_user_id" IS NULL THEN 'SYSTEM'
  WHEN m."from_user_id" = t."job_poster_user_id" THEN 'POSTER'
  WHEN m."from_user_id" = t."contractor_user_id" THEN 'CONTRACTOR'
  ELSE 'SYSTEM'
END
FROM "v4_message_threads" AS t
WHERE m."thread_id" = t."id";

CREATE INDEX IF NOT EXISTS "v4_messages_thread_idx" ON "v4_messages" ("thread_id");
CREATE INDEX IF NOT EXISTS "v4_messages_sender_role_idx" ON "v4_messages" ("sender_role");
