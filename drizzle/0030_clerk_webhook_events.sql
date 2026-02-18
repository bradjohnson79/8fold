-- Clerk webhook idempotency store (replay protection).
-- Safe to run multiple times.

create table if not exists "8fold_test"."clerk_webhook_events" (
  "eventId" text primary key,
  "createdAt" timestamptz not null default now()
);
