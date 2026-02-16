-- Admin app isolated sessions (apps/admin).
-- Safe to run multiple times.
-- NOTE: This targets local dev schema `8fold_test` (consistent with other legacy session migrations).

create table if not exists "8fold_test"."admin_sessions" (
  "id" text primary key,
  "adminUserId" uuid not null,
  "sessionTokenHash" text not null unique,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now()
);

create index if not exists "admin_sessions_adminUserId_idx" on "8fold_test"."admin_sessions" ("adminUserId");
create index if not exists "admin_sessions_expiresAt_idx" on "8fold_test"."admin_sessions" ("expiresAt");

