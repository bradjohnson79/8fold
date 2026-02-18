-- Add Clerk identity mapping on User table.
-- Safe path even if users table is non-empty:
-- 1) add nullable column
-- 2) backfill existing rows
-- 3) enforce NOT NULL + unique index

alter table "8fold_test"."User"
  add column if not exists "clerkUserId" text;

update "8fold_test"."User"
set "clerkUserId" = coalesce("clerkUserId", "authUserId", "id")
where "clerkUserId" is null;

alter table "8fold_test"."User"
  alter column "clerkUserId" set not null;

create unique index if not exists "User_clerkUserId_key"
  on "8fold_test"."User" ("clerkUserId");
