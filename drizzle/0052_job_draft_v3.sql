-- V3 deploy phase: create-only migration.
-- No destructive changes to V2 tables/enums in this migration.
-- Idempotent: safe to run when types/table already exist.

DO $$
DECLARE
  s text := current_schema();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = 'JobDraftStatus' AND n.nspname = s) THEN
    EXECUTE format('CREATE TYPE %I."JobDraftStatus" AS ENUM (''ACTIVE'', ''ARCHIVED'')', s);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = 'JobDraftStep' AND n.nspname = s) THEN
    EXECUTE format('CREATE TYPE %I."JobDraftStep" AS ENUM (''DETAILS'', ''PRICING'', ''AVAILABILITY'', ''PAYMENT'', ''CONFIRMED'')', s);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "JobDraft" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" text NOT NULL,
  "status" "JobDraftStatus" NOT NULL DEFAULT 'ACTIVE',
  "step" "JobDraftStep" NOT NULL DEFAULT 'DETAILS',
  "data" jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'JobDraft' AND column_name = 'userId'
  ) THEN
    CREATE INDEX IF NOT EXISTS "JobDraft_userId_status_idx" ON "JobDraft" ("userId", "status");
  END IF;
END $$;
