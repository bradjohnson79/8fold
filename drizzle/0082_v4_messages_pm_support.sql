-- V4 Job Poster: messaging, PM, support tables.
-- Do not touch legacy conversations, messages, support_tickets, PmRequest.

CREATE TABLE IF NOT EXISTS "v4_message_threads" (
  "id" text PRIMARY KEY,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "job_poster_user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "contractor_user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "last_message_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "v4_message_threads_job_participants_uniq"
  ON "v4_message_threads" ("job_id", "job_poster_user_id", "contractor_user_id");
CREATE INDEX IF NOT EXISTS "v4_message_threads_job_poster_idx" ON "v4_message_threads" ("job_poster_user_id");
CREATE INDEX IF NOT EXISTS "v4_message_threads_contractor_idx" ON "v4_message_threads" ("contractor_user_id");

CREATE TABLE IF NOT EXISTS "v4_messages" (
  "id" text PRIMARY KEY,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "from_user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "to_user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "read_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "v4_messages_job_idx" ON "v4_messages" ("job_id");
CREATE INDEX IF NOT EXISTS "v4_messages_from_to_idx" ON "v4_messages" ("from_user_id", "to_user_id");

CREATE TABLE IF NOT EXISTS "v4_support_tickets" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "subject" text NOT NULL,
  "category" text NOT NULL,
  "body" text NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "v4_support_tickets_user_idx" ON "v4_support_tickets" ("user_id");

CREATE TABLE IF NOT EXISTS "v4_pm_requests" (
  "id" text PRIMARY KEY,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "contractor_user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "job_poster_user_id" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'PENDING',
  "subtotal" numeric(12,2) NOT NULL DEFAULT 0,
  "tax" numeric(12,2) NOT NULL DEFAULT 0,
  "total" numeric(12,2) NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "v4_pm_requests_job_poster_idx" ON "v4_pm_requests" ("job_poster_user_id");

CREATE TABLE IF NOT EXISTS "v4_pm_request_items" (
  "id" text PRIMARY KEY,
  "pm_request_id" text NOT NULL REFERENCES "v4_pm_requests"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "qty" integer NOT NULL DEFAULT 1,
  "url" text,
  "unit_price" numeric(12,2) NOT NULL DEFAULT 0,
  "line_total" numeric(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "v4_pm_request_items_pm_request_idx" ON "v4_pm_request_items" ("pm_request_id");
