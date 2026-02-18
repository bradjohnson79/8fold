-- Static mock job dataset support (North America v1).
-- Add a batch marker + performance indexes for filtering.

alter table "8fold_test"."Job"
  add column if not exists "mockSeedBatch" text;

-- Fast filtering for admin + router tooling.
create index if not exists "Job_country_idx" on "8fold_test"."Job" ("country");
create index if not exists "Job_regionCode_idx" on "8fold_test"."Job" ("regionCode");
create index if not exists "Job_city_idx" on "8fold_test"."Job" ("city");
create index if not exists "Job_status_idx" on "8fold_test"."Job" ("status");
create index if not exists "Job_isMock_idx" on "8fold_test"."Job" ("isMock");
create index if not exists "Job_tradeCategory_idx" on "8fold_test"."Job" ("tradeCategory");
create index if not exists "Job_mockSeedBatch_idx" on "8fold_test"."Job" ("mockSeedBatch");

-- Common dev filter path: "show me this static batch" (optionally by status).
create index if not exists "Job_isMock_mockSeedBatch_status_idx"
  on "8fold_test"."Job" ("isMock", "mockSeedBatch", "status");

