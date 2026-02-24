-- Stripe webhook idempotency store (replay protection).
-- Safe to run multiple times. No data dropped.

create table if not exists "StripeWebhookEvent" (
  "id" text primary key,
  "type" text not null,
  "objectId" text,
  "createdAt" timestamptz not null default now(),
  "processedAt" timestamptz
);
