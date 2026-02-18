-- Align `User` table with Drizzle schema.
-- Some environments may predate this column; make it additive + idempotent.

alter table "8fold_test"."User"
  add column if not exists "referredByRouterId" text;

