-- Add defaults to JobDraft legacy NOT NULL columns so V3 INSERT (7 columns only) succeeds.
-- Production has 24 columns; V3 Drizzle inserts only id, userId, status, step, data, createdAt, updatedAt.
-- Legacy columns (title, scope, region, etc.) block INSERT without defaults.
-- Idempotent: safe to run when defaults already exist.

DO $$
DECLARE
  s text := current_schema();
BEGIN
  -- updatedAt: Drizzle uses default; production has no default
  EXECUTE format('ALTER TABLE %I."JobDraft" ALTER COLUMN "updatedAt" SET DEFAULT now()', s);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format('ALTER TABLE %I."JobDraft" ALTER COLUMN "title" SET DEFAULT ''''', s);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format('ALTER TABLE %I."JobDraft" ALTER COLUMN "scope" SET DEFAULT ''''', s);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format('ALTER TABLE %I."JobDraft" ALTER COLUMN "region" SET DEFAULT ''''', s);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format('ALTER TABLE %I."JobDraft" ALTER COLUMN "serviceType" SET DEFAULT ''''', s);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format('ALTER TABLE %I."JobDraft" ALTER COLUMN "routerEarningsCents" SET DEFAULT 0', s);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format('ALTER TABLE %I."JobDraft" ALTER COLUMN "brokerFeeCents" SET DEFAULT 0', s);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format('ALTER TABLE %I."JobDraft" ALTER COLUMN "createdByAdminUserId" SET DEFAULT ''''', s);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- jobType: JobType enum; use 'urban' as default for V3 placeholder rows
DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format('ALTER TABLE %I."JobDraft" ALTER COLUMN "jobType" SET DEFAULT ''urban''::%I."JobType"', s, s);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
