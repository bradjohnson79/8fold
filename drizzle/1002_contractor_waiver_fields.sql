-- Contractor waiver persistence (production model).
-- Stores acceptance and timestamp on contractor_accounts.
--
-- Forward-only: safe to apply multiple times.
-- Uses current_schema() (repo uses DATABASE_URL ?schema=... with search_path).

DO $$
DECLARE
  s TEXT := current_schema();
BEGIN
  EXECUTE format(
    'ALTER TABLE %I.contractor_accounts
      ADD COLUMN IF NOT EXISTS "waiverAccepted" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "waiverAcceptedAt" timestamptz;',
    s
  );
END $$;

