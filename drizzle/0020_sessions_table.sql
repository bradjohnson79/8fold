-- Add legacy web-auth sessions table (no runtime DDL).
-- This table is used by apps/web server auth.
-- NOTE: Migrations in this repo target the schema used by the app via DATABASE_URL ?schema=...
-- In local dev for this repo, that schema is `8fold_test`.

create table if not exists "8fold_test"."sessions" (
  "id" text primary key,
  "userId" text not null,
  "role" text not null,
  "expiresAt" timestamptz not null
);

create index if not exists "sessions_userId_idx" on "8fold_test"."sessions" ("userId");
create index if not exists "sessions_expiresAt_idx" on "8fold_test"."sessions" ("expiresAt");

