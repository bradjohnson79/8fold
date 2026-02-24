CREATE TABLE IF NOT EXISTS "v4_rate_limit_buckets" (
  "key" text PRIMARY KEY,
  "window_start" timestamptz NOT NULL,
  "count" integer NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
