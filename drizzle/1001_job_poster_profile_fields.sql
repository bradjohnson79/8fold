-- Extend job_poster_accounts with onboarding profile fields (forward-only).
-- Adds columns safely without dropping/modifying existing data.
--
-- Note: this repo uses DATABASE_URL ?schema=... with search_path; we apply to current_schema().

DO $$
DECLARE
  s TEXT := current_schema();
BEGIN
  EXECUTE format(
    'ALTER TABLE %I.job_poster_accounts
      ADD COLUMN IF NOT EXISTS "fullName" text,
      ADD COLUMN IF NOT EXISTS "phone" text;',
    s
  );
END $$;

