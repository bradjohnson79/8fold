CREATE TABLE IF NOT EXISTS "v4_idempotency_keys" (
  "key" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "request_hash" text NOT NULL,
  "status" text NOT NULL,
  "job_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
