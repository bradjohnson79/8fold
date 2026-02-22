-- Canonical jurisdiction columns for containment enforcement.
-- Additive + idempotent. Backfill from existing location sources.
-- Schema-agnostic: uses current_schema() for compatibility with 8fold_test and public.

DO $$
DECLARE
  s text := current_schema();
  user_state_sql text;
  job_state_sql text;
BEGIN
  EXECUTE format('ALTER TABLE %I."User" ADD COLUMN IF NOT EXISTS "countryCode" "CountryCode"', s);
  EXECUTE format('ALTER TABLE %I."User" ADD COLUMN IF NOT EXISTS "stateCode" text', s);
  EXECUTE format('ALTER TABLE %I."Job" ADD COLUMN IF NOT EXISTS "countryCode" "CountryCode"', s);
  EXECUTE format('ALTER TABLE %I."Job" ADD COLUMN IF NOT EXISTS "stateCode" text', s);

  -- User backfill (coalesce as text to avoid enum/text mismatch, then cast result)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = s AND table_name = 'User' AND column_name = 'country') THEN
    EXECUTE format(
      'UPDATE %I."User" u SET "countryCode" = (coalesce(u."countryCode"::text, u."country"::text, ''US''))::"CountryCode"',
      s
    );
  ELSE
    EXECUTE format(
      'UPDATE %I."User" u SET "countryCode" = (coalesce(u."countryCode"::text, ''US''))::"CountryCode"',
      s
    );
  END IF;
  -- User stateCode: build coalesce from columns that exist (production may lack some)
  user_state_sql := 'nullif(upper(trim(coalesce(u."stateCode", ''''))), '''')';
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = s AND table_name = 'User' AND column_name = 'legalProvince') THEN
    user_state_sql := user_state_sql || ', nullif(upper(trim(coalesce(u."legalProvince", ''''))), '''')';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = s AND table_name = 'RouterProfile' AND column_name = 'stateProvince') THEN
    user_state_sql := user_state_sql || ', nullif(upper(trim((select rp."stateProvince" from ' || quote_ident(s) || '."RouterProfile" rp where rp."userId" = u."id" limit 1))), '''')';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = s AND table_name = 'JobPosterProfile' AND column_name = 'stateProvince') THEN
    user_state_sql := user_state_sql || ', nullif(upper(trim((select jpp."stateProvince" from ' || quote_ident(s) || '."JobPosterProfile" jpp where jpp."userId" = u."id" limit 1))), '''')';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = s AND table_name = 'contractor_accounts' AND column_name = 'regionCode') THEN
    user_state_sql := user_state_sql || ', nullif(upper(trim((select ca."regionCode" from ' || quote_ident(s) || '."contractor_accounts" ca where ca."userId" = u."id" limit 1))), '''')';
  END IF;
  EXECUTE format('UPDATE %I."User" u SET "stateCode" = coalesce(%s)', s, user_state_sql);

  -- Job backfill
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = s AND table_name = 'Job' AND column_name = 'country') THEN
    EXECUTE format(
      'UPDATE %I."Job" j SET "countryCode" = (coalesce(j."countryCode"::text, j."country"::text, ''US''))::"CountryCode"',
      s
    );
  ELSE
    EXECUTE format(
      'UPDATE %I."Job" j SET "countryCode" = (coalesce(j."countryCode"::text, ''US''))::"CountryCode"',
      s
    );
  END IF;
  -- Job stateCode: build coalesce from columns that exist
  job_state_sql := 'nullif(upper(trim(coalesce(j."stateCode", ''''))), '''')';
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = s AND table_name = 'Job' AND column_name = 'regionCode') THEN
    job_state_sql := job_state_sql || ', nullif(upper(trim(coalesce(j."regionCode", ''''))), '''')';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = s AND table_name = 'Job' AND column_name = 'region') THEN
    job_state_sql := job_state_sql || ', nullif(upper(trim(regexp_replace(coalesce(j."region", ''''), ''^.*-'', ''''))), '''')';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = s AND table_name = 'JobPosterProfile' AND column_name = 'stateProvince') THEN
    job_state_sql := job_state_sql || ', nullif(upper(trim((select jpp."stateProvince" from ' || quote_ident(s) || '."JobPosterProfile" jpp where jpp."userId" = j."jobPosterUserId" limit 1))), '''')';
  END IF;
  EXECUTE format('UPDATE %I."Job" j SET "stateCode" = coalesce(%s)', s, job_state_sql);

  -- Required going forward (non-null with safe defaults)
  EXECUTE format('UPDATE %I."User" SET "countryCode" = (coalesce("countryCode"::text, ''US''))::"CountryCode", "stateCode" = coalesce("stateCode", '''')', s);
  EXECUTE format('UPDATE %I."Job" SET "countryCode" = (coalesce("countryCode"::text, ''US''))::"CountryCode", "stateCode" = coalesce("stateCode", '''')', s);

  EXECUTE format('ALTER TABLE %I."User" ALTER COLUMN "countryCode" SET DEFAULT ''US''::"CountryCode"', s);
  EXECUTE format('ALTER TABLE %I."User" ALTER COLUMN "countryCode" SET NOT NULL', s);
  EXECUTE format('ALTER TABLE %I."User" ALTER COLUMN "stateCode" SET DEFAULT ''''', s);
  EXECUTE format('ALTER TABLE %I."User" ALTER COLUMN "stateCode" SET NOT NULL', s);

  EXECUTE format('ALTER TABLE %I."Job" ALTER COLUMN "countryCode" SET DEFAULT ''US''::"CountryCode"', s);
  EXECUTE format('ALTER TABLE %I."Job" ALTER COLUMN "countryCode" SET NOT NULL', s);
  EXECUTE format('ALTER TABLE %I."Job" ALTER COLUMN "stateCode" SET DEFAULT ''''', s);
  EXECUTE format('ALTER TABLE %I."Job" ALTER COLUMN "stateCode" SET NOT NULL', s);
END $$;
