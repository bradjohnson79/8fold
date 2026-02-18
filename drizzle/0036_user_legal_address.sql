-- Dual-address system: store legal address separately from routing location.
-- Additive + idempotent.

alter table "8fold_test"."User"
  add column if not exists "legalStreet" text not null default '',
  add column if not exists "legalCity" text not null default '',
  add column if not exists "legalProvince" text not null default '',
  add column if not exists "legalPostalCode" text not null default '',
  add column if not exists "legalCountry" text not null default 'US';

