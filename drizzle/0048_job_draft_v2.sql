-- Job Post Wizard V2: JobDraftV2 + JobDraftV2FieldState
-- Schema-agnostic: uses current_schema() for multi-tenant compatibility.

DO $$
DECLARE
  s TEXT := current_schema();
BEGIN
  -- Create enums in current schema (idempotent)
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = 'JobDraftV2Step' AND n.nspname = s) THEN
    EXECUTE format('CREATE TYPE %I."JobDraftV2Step" AS ENUM (''PROFILE'', ''DETAILS'', ''PRICING'', ''PAYMENT'', ''CONFIRMED'')', s);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = 'JobDraftV2FieldStateStatus' AND n.nspname = s) THEN
    EXECUTE format('CREATE TYPE %I."JobDraftV2FieldStateStatus" AS ENUM (''idle'', ''saving'', ''saved'', ''error'')', s);
  END IF;

  -- JobDraftV2 table
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I."JobDraftV2" (
      "id" text PRIMARY KEY,
      "userId" text NOT NULL,
      "countryCode" "CountryCode" NOT NULL DEFAULT ''US''::"CountryCode",
      "stateCode" text NOT NULL DEFAULT '''',
      "currentStep" "JobDraftV2Step" NOT NULL DEFAULT ''PROFILE''::"JobDraftV2Step",
      "data" jsonb NOT NULL DEFAULT ''{}''::jsonb,
      "validation" jsonb NOT NULL DEFAULT ''{}''::jsonb,
      "lastSavedAt" timestamptz,
      "version" integer NOT NULL DEFAULT 1,
      "archivedAt" timestamptz,
      "jobId" text,
      "paymentIntentId" text,
      "paymentIntentCreatedAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )',
    s
  );

  -- JobDraftV2FieldState table
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I."JobDraftV2FieldState" (
      "draftId" text NOT NULL,
      "fieldKey" text NOT NULL,
      "valueHash" text,
      "status" "JobDraftV2FieldStateStatus" NOT NULL DEFAULT ''idle''::"JobDraftV2FieldStateStatus",
      "savedAt" timestamptz,
      "lastErrorCode" text,
      "lastErrorMessage" text,
      PRIMARY KEY ("draftId", "fieldKey")
    )',
    s
  );

  -- Index for active draft lookup: userId + createdAt desc
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS "JobDraftV2_userId_createdAt_idx" ON %I."JobDraftV2" ("userId", "createdAt" DESC)',
    s
  );

  -- Index for currentStep + archivedAt (active draft filter)
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS "JobDraftV2_currentStep_archivedAt_idx" ON %I."JobDraftV2" ("currentStep", "archivedAt")',
    s
  );

  -- Index for field state lookup by draft
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS "JobDraftV2FieldState_draftId_idx" ON %I."JobDraftV2FieldState" ("draftId")',
    s
  );
END $$;
