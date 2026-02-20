-- Canonical jurisdiction columns for containment enforcement.
-- Additive + idempotent. Backfill from existing location sources.

alter table "User"
  add column if not exists "countryCode" "CountryCode",
  add column if not exists "stateCode" text;

alter table "Job"
  add column if not exists "countryCode" "CountryCode",
  add column if not exists "stateCode" text;

-- User backfill
update "User" u
set
  "countryCode" = coalesce(u."countryCode", u."country", 'US'::"CountryCode"),
  "stateCode" = coalesce(
    nullif(upper(trim(u."stateCode")), ''),
    nullif(upper(trim(u."legalProvince")), ''),
    nullif(upper(trim((select rp."stateProvince" from "RouterProfile" rp where rp."userId" = u."id" limit 1))), ''),
    nullif(upper(trim((select jpp."stateProvince" from "JobPosterProfile" jpp where jpp."userId" = u."id" limit 1))), ''),
    nullif(upper(trim((select ca."regionCode" from "contractor_accounts" ca where ca."userId" = u."id" limit 1))), '')
  );

-- Job backfill
update "Job" j
set
  "countryCode" = coalesce(j."countryCode", j."country", 'US'::"CountryCode"),
  "stateCode" = coalesce(
    nullif(upper(trim(j."stateCode")), ''),
    nullif(upper(trim(j."regionCode")), ''),
    nullif(upper(trim(regexp_replace(coalesce(j."region", ''), '^.*-', ''))), ''),
    nullif(upper(trim((select jpp."stateProvince" from "JobPosterProfile" jpp where jpp."userId" = j."jobPosterUserId" limit 1))), '')
  );

-- Required going forward (non-null with safe defaults).
update "User" set "countryCode" = coalesce("countryCode", 'US'::"CountryCode"), "stateCode" = coalesce("stateCode", '');
update "Job" set "countryCode" = coalesce("countryCode", 'US'::"CountryCode"), "stateCode" = coalesce("stateCode", '');

alter table "User"
  alter column "countryCode" set default 'US'::"CountryCode",
  alter column "countryCode" set not null,
  alter column "stateCode" set default '',
  alter column "stateCode" set not null;

alter table "Job"
  alter column "countryCode" set default 'US'::"CountryCode",
  alter column "countryCode" set not null,
  alter column "stateCode" set default '',
  alter column "stateCode" set not null;
-- Canonical jurisdiction columns for containment enforcement.
-- Additive + idempotent. Backfill from existing location sources.

alter table "User"
  add column if not exists "countryCode" "CountryCode",
  add column if not exists "stateCode" text;

alter table "Job"
  add column if not exists "countryCode" "CountryCode",
  add column if not exists "stateCode" text;

-- User backfill
update "User" u
set
  "countryCode" = coalesce(u."countryCode", u."country", 'US'::"CountryCode"),
  "stateCode" = coalesce(
    nullif(upper(trim(u."stateCode")), ''),
    nullif(upper(trim(u."legalProvince")), ''),
    nullif(upper(trim((select rp."stateProvince" from "RouterProfile" rp where rp."userId" = u."id" limit 1))), ''),
    nullif(upper(trim((select jpp."stateProvince" from "JobPosterProfile" jpp where jpp."userId" = u."id" limit 1))), ''),
    nullif(upper(trim((select ca."regionCode" from "contractor_accounts" ca where ca."userId" = u."id" limit 1))), '')
  );

-- Job backfill
update "Job" j
set
  "countryCode" = coalesce(j."countryCode", j."country", 'US'::"CountryCode"),
  "stateCode" = coalesce(
    nullif(upper(trim(j."stateCode")), ''),
    nullif(upper(trim(j."regionCode")), ''),
    nullif(upper(trim(regexp_replace(coalesce(j."region", ''), '^.*-', ''))), ''),
    nullif(upper(trim((select jpp."stateProvince" from "JobPosterProfile" jpp where jpp."userId" = j."jobPosterUserId" limit 1))), '')
  );

-- Required going forward (non-null with safe defaults).
update "User" set "countryCode" = coalesce("countryCode", 'US'::"CountryCode"), "stateCode" = coalesce("stateCode", '');
update "Job" set "countryCode" = coalesce("countryCode", 'US'::"CountryCode"), "stateCode" = coalesce("stateCode", '');

alter table "User"
  alter column "countryCode" set default 'US'::"CountryCode",
  alter column "countryCode" set not null,
  alter column "stateCode" set default '',
  alter column "stateCode" set not null;

alter table "Job"
  alter column "countryCode" set default 'US'::"CountryCode",
  alter column "countryCode" set not null,
  alter column "stateCode" set default '',
  alter column "stateCode" set not null;
