-- Structured geocoding: store normalized postal/city/street for profiles.
-- Additive + idempotent for older DB snapshots.

alter table "8fold_test"."JobPosterProfile"
  add column if not exists "postalCode" text;

alter table "8fold_test"."RouterProfile"
  add column if not exists "street" text,
  add column if not exists "city" text,
  add column if not exists "postalCode" text,
  add column if not exists "country" text;

