-- Production parity repair for JobDraftV2 objects.
-- Safe to run repeatedly and safe if prior migration was partially applied.
-- Uses current_schema() so it follows DATABASE_URL schema routing.

DO $$
DECLARE
  s text := current_schema();
BEGIN
  -- Enums (schema-scoped)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'JobDraftV2Step'
      AND n.nspname = s
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I."JobDraftV2Step" AS ENUM (''PROFILE'', ''DETAILS'', ''PRICING'', ''PAYMENT'', ''CONFIRMED'')',
      s
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'JobDraftV2FieldStateStatus'
      AND n.nspname = s
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I."JobDraftV2FieldStateStatus" AS ENUM (''idle'', ''saving'', ''saved'', ''error'')',
      s
    );
  END IF;

  -- Base tables (create if missing)
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

  -- Repair partially-created JobDraftV2 columns
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "id" text', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "userId" text', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "countryCode" "CountryCode"', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "stateCode" text', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "currentStep" "JobDraftV2Step"', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "data" jsonb', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "validation" jsonb', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "lastSavedAt" timestamptz', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "version" integer', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "archivedAt" timestamptz', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "jobId" text', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "paymentIntentId" text', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "paymentIntentCreatedAt" timestamptz', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz', s);

  -- Repair partially-created JobDraftV2FieldState columns
  EXECUTE format('ALTER TABLE %I."JobDraftV2FieldState" ADD COLUMN IF NOT EXISTS "draftId" text', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2FieldState" ADD COLUMN IF NOT EXISTS "fieldKey" text', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2FieldState" ADD COLUMN IF NOT EXISTS "valueHash" text', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2FieldState" ADD COLUMN IF NOT EXISTS "status" "JobDraftV2FieldStateStatus"', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2FieldState" ADD COLUMN IF NOT EXISTS "savedAt" timestamptz', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2FieldState" ADD COLUMN IF NOT EXISTS "lastErrorCode" text', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2FieldState" ADD COLUMN IF NOT EXISTS "lastErrorMessage" text', s);

  -- Normalize defaults / nullability (non-destructive for existing data)
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ALTER COLUMN "countryCode" SET DEFAULT ''US''::"CountryCode"', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ALTER COLUMN "stateCode" SET DEFAULT ''''', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ALTER COLUMN "currentStep" SET DEFAULT ''PROFILE''::"JobDraftV2Step"', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ALTER COLUMN "data" SET DEFAULT ''{}''::jsonb', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ALTER COLUMN "validation" SET DEFAULT ''{}''::jsonb', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ALTER COLUMN "version" SET DEFAULT 1', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ALTER COLUMN "createdAt" SET DEFAULT now()', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2" ALTER COLUMN "updatedAt" SET DEFAULT now()', s);
  EXECUTE format('ALTER TABLE %I."JobDraftV2FieldState" ALTER COLUMN "status" SET DEFAULT ''idle''::"JobDraftV2FieldStateStatus"', s);

  -- Ensure expected constraints
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = s
      AND rel.relname = 'JobDraftV2'
      AND c.contype = 'p'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I."JobDraftV2" ADD CONSTRAINT "JobDraftV2_pkey" PRIMARY KEY ("id")',
      s
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = s
      AND rel.relname = 'JobDraftV2FieldState'
      AND c.contype = 'p'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I."JobDraftV2FieldState" ADD CONSTRAINT "JobDraftV2FieldState_pkey" PRIMARY KEY ("draftId", "fieldKey")',
      s
    );
  END IF;

  -- Expected indexes used by current read patterns
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS "JobDraftV2_userId_createdAt_idx" ON %I."JobDraftV2" ("userId", "createdAt" DESC)',
    s
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS "JobDraftV2_currentStep_archivedAt_idx" ON %I."JobDraftV2" ("currentStep", "archivedAt")',
    s
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS "JobDraftV2FieldState_draftId_idx" ON %I."JobDraftV2FieldState" ("draftId")',
    s
  );
END $$;
