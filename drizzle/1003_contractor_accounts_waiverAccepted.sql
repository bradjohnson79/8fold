-- Ensure contractor_accounts has waiverAccepted flag (forward-only).
-- This is intentionally redundant with 1002_contractor_waiver_fields.sql to unblock environments
-- where the earlier migration chain did not run cleanly.
--
-- Do NOT add runtime DDL; schema is managed via migrations.

DO $$
DECLARE
  s TEXT := current_schema();
BEGIN
  EXECUTE format(
    'ALTER TABLE %I.contractor_accounts
      ADD COLUMN IF NOT EXISTS "waiverAccepted" boolean NOT NULL DEFAULT false;',
    s
  );
END $$;

