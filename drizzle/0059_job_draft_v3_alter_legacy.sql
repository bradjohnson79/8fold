-- Option C: Alter existing JobDraft for V3 compatibility.
-- Adds ACTIVE/ARCHIVED to JobDraftStatus, adds userId/step/data, migrates legacy data.
-- Idempotent: safe to run when columns already exist.
-- Schema-agnostic: uses current_schema().

-- Phase 1: Add enum values and commit. New enum values cannot be used until committed.
BEGIN;
DO $$
DECLARE
  s text := current_schema();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'JobDraftStatus' AND n.nspname = s AND e.enumlabel = 'ACTIVE'
  ) THEN
    EXECUTE format('ALTER TYPE %I."JobDraftStatus" ADD VALUE ''ACTIVE''', s);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'JobDraftStatus' AND n.nspname = s AND e.enumlabel = 'ARCHIVED'
  ) THEN
    EXECUTE format('ALTER TYPE %I."JobDraftStatus" ADD VALUE ''ARCHIVED''', s);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE t.typname = 'JobDraftStep' AND n.nspname = s
  ) THEN
    EXECUTE format('CREATE TYPE %I."JobDraftStep" AS ENUM (''DETAILS'', ''PRICING'', ''AVAILABILITY'', ''PAYMENT'', ''CONFIRMED'')', s);
  END IF;
END $$;
COMMIT;

-- Phase 2: Add columns, backfill, migrate status (can use new enum values now)
BEGIN;

-- 3. Add userId column if missing
DO $$
DECLARE
  s text := current_schema();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'JobDraft' AND column_name = 'userId'
  ) THEN
    EXECUTE format('ALTER TABLE %I."JobDraft" ADD COLUMN "userId" text', s);
  END IF;
END $$;

-- 4. Add step column if missing
DO $$
DECLARE
  s text := current_schema();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'JobDraft' AND column_name = 'step'
  ) THEN
    EXECUTE format('ALTER TABLE %I."JobDraft" ADD COLUMN "step" %I."JobDraftStep" NOT NULL DEFAULT ''DETAILS''', s, s);
  END IF;
END $$;

-- 5. Add data column if missing
DO $$
DECLARE
  s text := current_schema();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'JobDraft' AND column_name = 'data'
  ) THEN
    EXECUTE format('ALTER TABLE %I."JobDraft" ADD COLUMN "data" jsonb NOT NULL DEFAULT ''{}''', s);
  END IF;
END $$;

-- 6. Backfill userId from legacy columns (createdByJobPosterUserId, createdByAdminUserId)
-- Only when BOTH legacy columns exist (avoids running on V3-only schema)
DO $$
DECLARE
  s text := current_schema();
  has_poster int;
  has_admin int;
BEGIN
  SELECT COUNT(*) INTO has_poster FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'JobDraft' AND column_name = 'createdByJobPosterUserId';
  SELECT COUNT(*) INTO has_admin FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'JobDraft' AND column_name = 'createdByAdminUserId';

  IF has_poster > 0 AND has_admin > 0 THEN
    EXECUTE format(
      'UPDATE %I."JobDraft" SET "userId" = COALESCE("createdByJobPosterUserId", "createdByAdminUserId", ''MIGRATION_ORPHAN'') WHERE "userId" IS NULL',
      s
    );
  ELSIF has_poster > 0 THEN
    EXECUTE format(
      'UPDATE %I."JobDraft" SET "userId" = COALESCE("createdByJobPosterUserId", ''MIGRATION_ORPHAN'') WHERE "userId" IS NULL',
      s
    );
  ELSIF has_admin > 0 THEN
    EXECUTE format(
      'UPDATE %I."JobDraft" SET "userId" = COALESCE("createdByAdminUserId", ''MIGRATION_ORPHAN'') WHERE "userId" IS NULL',
      s
    );
  END IF;
END $$;

-- 7. Backfill data from legacy flat columns (only when data is empty and legacy cols exist)
-- Build jsonb dynamically from columns that exist (production vs local may differ)
DO $$
DECLARE
  s text := current_schema();
  parts text := '';
  cols text[] := ARRAY['title','scope','region','serviceType','timeWindow','notesInternal','tradeCategory','lat','lng','contractorPayoutCents','laborTotalCents','materialsTotalCents','transactionFeeCents','routerEarningsCents','brokerFeeCents'];
  col text;
  has_any int := 0;
BEGIN
  SELECT COUNT(*) INTO has_any FROM information_schema.columns
    WHERE table_schema = s AND table_name = 'JobDraft' AND column_name = 'title';
  IF has_any = 0 THEN RETURN; END IF;

  FOREACH col IN ARRAY cols
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = s AND table_name = 'JobDraft' AND column_name = col) THEN
      IF length(parts) > 0 THEN parts := parts || ', '; END IF;
      parts := parts || format('''%s'', %I', col, col);
    END IF;
  END LOOP;
  IF length(parts) > 0 THEN
    parts := parts || ', ''_legacy'', true';
    EXECUTE format(
      'UPDATE %I."JobDraft" SET "data" = jsonb_build_object(%s) WHERE ("data" IS NULL OR "data" = ''{}''::jsonb)',
      s, parts
    );
  END IF;
END $$;

-- 8. Migrate status: map legacy values to ACTIVE or ARCHIVED
DO $$
DECLARE
  s text := current_schema();
BEGIN
  -- In-progress statuses -> ACTIVE
  EXECUTE format(
    'UPDATE %I."JobDraft" SET status = ''ACTIVE''::%I."JobDraftStatus"
     WHERE status::text IN (''DRAFT'', ''IN_REVIEW'', ''NEEDS_CLARIFICATION'', ''APPRAISING'', ''PRICED'', ''PAYMENT_PENDING'', ''PAYMENT_FAILED'')',
    s, s
  );
  -- Terminal statuses -> ARCHIVED
  EXECUTE format(
    'UPDATE %I."JobDraft" SET status = ''ARCHIVED''::%I."JobDraftStatus"
     WHERE status::text IN (''APPROVED'', ''REJECTED'', ''CANCELLED'')',
    s, s
  );
EXCEPTION
  WHEN undefined_column THEN NULL;  -- status might not be the legacy enum
  WHEN invalid_text_representation THEN NULL;  -- enum cast might fail
END $$;

-- 9. Set userId NOT NULL (only if no nulls remain)
DO $$
DECLARE
  s text := current_schema();
  null_count bigint;
BEGIN
  EXECUTE format('SELECT COUNT(*) FROM %I."JobDraft" WHERE "userId" IS NULL', s) INTO null_count;
  IF null_count = 0 THEN
    EXECUTE format('ALTER TABLE %I."JobDraft" ALTER COLUMN "userId" SET NOT NULL', s);
  END IF;
EXCEPTION
  WHEN others THEN NULL;  -- Column might already be NOT NULL
END $$;

-- 10. Create index if not exists
CREATE INDEX IF NOT EXISTS "JobDraft_userId_status_idx" ON "JobDraft" ("userId", "status");

COMMIT;
