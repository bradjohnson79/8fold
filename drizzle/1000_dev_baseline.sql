-- DEV BASELINE (forward-only safety migration)
-- Purpose: guarantee job_poster_accounts exists in the active schema used by the app.
-- This repo uses DATABASE_URL ?schema=... and search_path for multi-schema environments.
--
-- IMPORTANT:
-- - Do NOT edit old migrations (history is immutable).
-- - Do NOT add runtime DDL in request paths.
-- - This is a safety net for dev DB reset / drift scenarios.
--
-- Implementation detail:
-- - We create the table in the *current schema* (resolved via current_schema()).
-- - In local dev for this repo, that schema is typically `8fold_test`.

DO $$
DECLARE
  s TEXT := current_schema();
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.job_poster_accounts (
      "userId" text PRIMARY KEY,
      "wizardCompleted" boolean NOT NULL DEFAULT false,
      "termsAccepted" boolean NOT NULL DEFAULT false,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    );',
    s
  );
END $$;

