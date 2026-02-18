-- Store canonical geocoded location on the authenticated User.
-- Additive + idempotent for older DB snapshots.
--
-- NOTE: We default to sentinel values so the columns can be NOT NULL safely.
-- Application-level validation requires real coordinates on profile save.

alter table "8fold_test"."User"
  add column if not exists "formattedAddress" text not null default '';

alter table "8fold_test"."User"
  add column if not exists "latitude" double precision not null default 0;

alter table "8fold_test"."User"
  add column if not exists "longitude" double precision not null default 0;

