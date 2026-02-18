-- Align `Job` table with Drizzle schema.
-- Additive + idempotent for older DB snapshots that predate `updatedAt`.

alter table "8fold_test"."Job"
  add column if not exists "updatedAt" timestamp without time zone not null default now();

