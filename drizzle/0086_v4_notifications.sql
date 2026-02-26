CREATE TABLE IF NOT EXISTS "public"."v4_notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "job_id" text,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "read_at" timestamp
);

CREATE INDEX IF NOT EXISTS "v4_notifications_user_created_idx"
  ON "public"."v4_notifications" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "v4_notifications_user_read_idx"
  ON "public"."v4_notifications" ("user_id", "read_at");

CREATE INDEX IF NOT EXISTS "v4_notifications_job_type_idx"
  ON "public"."v4_notifications" ("job_id", "type");
