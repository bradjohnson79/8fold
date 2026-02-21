-- Align JobDraftV2 objects to runtime Drizzle schema (8fold_test).
-- Idempotent, non-destructive, and fully qualified.

create schema if not exists "8fold_test";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'JobDraftV2Step'
      AND n.nspname = '8fold_test'
  ) THEN
    EXECUTE 'CREATE TYPE "8fold_test"."JobDraftV2Step" AS ENUM (''PROFILE'', ''DETAILS'', ''PRICING'', ''PAYMENT'', ''CONFIRMED'')';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'JobDraftV2FieldStateStatus'
      AND n.nspname = '8fold_test'
  ) THEN
    EXECUTE 'CREATE TYPE "8fold_test"."JobDraftV2FieldStateStatus" AS ENUM (''idle'', ''saving'', ''saved'', ''error'')';
  END IF;
END $$;

create table if not exists "8fold_test"."JobDraftV2" (
  "id" text primary key,
  "userId" text not null,
  "countryCode" "8fold_test"."CountryCode" not null default 'US'::"8fold_test"."CountryCode",
  "stateCode" text not null default '',
  "currentStep" "8fold_test"."JobDraftV2Step" not null default 'PROFILE'::"8fold_test"."JobDraftV2Step",
  "data" jsonb not null default '{}'::jsonb,
  "validation" jsonb not null default '{}'::jsonb,
  "lastSavedAt" timestamptz,
  "version" integer not null default 1,
  "archivedAt" timestamptz,
  "jobId" text,
  "paymentIntentId" text,
  "paymentIntentCreatedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists "8fold_test"."JobDraftV2FieldState" (
  "draftId" text not null,
  "fieldKey" text not null,
  "valueHash" text,
  "status" "8fold_test"."JobDraftV2FieldStateStatus" not null default 'idle'::"8fold_test"."JobDraftV2FieldStateStatus",
  "savedAt" timestamptz,
  "lastErrorCode" text,
  "lastErrorMessage" text,
  primary key ("draftId", "fieldKey")
);

create index if not exists "JobDraftV2_userId_createdAt_idx"
  on "8fold_test"."JobDraftV2" ("userId", "createdAt" desc);

create index if not exists "JobDraftV2_currentStep_archivedAt_idx"
  on "8fold_test"."JobDraftV2" ("currentStep", "archivedAt");

create index if not exists "JobDraftV2FieldState_draftId_idx"
  on "8fold_test"."JobDraftV2FieldState" ("draftId");
