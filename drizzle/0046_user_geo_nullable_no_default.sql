-- Geo hardening: remove (0,0) defaults from User latitude/longitude.
-- Enforce NULL-only coordinate storage; application validates before save.

alter table "8fold_test"."User"
  alter column "latitude" drop default,
  alter column "latitude" drop not null,
  alter column "longitude" drop default,
  alter column "longitude" drop not null;
