-- Job flagging (public reporting -> admin oversight)
-- NOTE: Existing schema uses text IDs (uuid-as-text). Keep types consistent.

create table if not exists "8fold_test"."JobFlag" (
  "id" text primary key default (gen_random_uuid())::text,
  "jobId" text not null references "8fold_test"."Job"("id"),
  "userId" text references "8fold_test"."User"("id"),
  "reason" text not null,
  "createdAt" timestamptz not null default now(),
  "resolved" boolean not null default false
);

create index if not exists "JobFlag_jobId_idx" on "8fold_test"."JobFlag" ("jobId");
create index if not exists "JobFlag_resolved_idx" on "8fold_test"."JobFlag" ("resolved");

