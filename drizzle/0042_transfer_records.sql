-- Transfer records (Connect transfers + PayPal internal credits)
-- Authoritative trace for money movement at release time.

create table if not exists "8fold_test"."TransferRecord" (
  "id" uuid primary key default gen_random_uuid(),
  "jobId" text not null references "8fold_test"."Job"("id"),
  "role" text not null, -- CONTRACTOR | ROUTER | PLATFORM
  "userId" text not null references "8fold_test"."User"("id"),
  "amountCents" integer not null,
  "currency" text not null, -- CurrencyCode (CAD/USD) stored as text for flexibility
  "method" text not null, -- STRIPE | PAYPAL
  "stripeTransferId" text null,
  "externalRef" text null,
  "status" text not null, -- PENDING | SENT | FAILED
  "createdAt" timestamptz not null default now(),
  "releasedAt" timestamptz null,
  "failureReason" text null
);

-- Idempotency: one leg per job+role.
create unique index if not exists "TransferRecord_job_role_uniq"
  on "8fold_test"."TransferRecord" ("jobId", "role");

create index if not exists "TransferRecord_createdAt_idx"
  on "8fold_test"."TransferRecord" ("createdAt" desc);
create index if not exists "TransferRecord_jobId_idx"
  on "8fold_test"."TransferRecord" ("jobId");
create index if not exists "TransferRecord_userId_idx"
  on "8fold_test"."TransferRecord" ("userId");
create index if not exists "TransferRecord_status_idx"
  on "8fold_test"."TransferRecord" ("status");
create index if not exists "TransferRecord_method_idx"
  on "8fold_test"."TransferRecord" ("method");
create index if not exists "TransferRecord_role_idx"
  on "8fold_test"."TransferRecord" ("role");

