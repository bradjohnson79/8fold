-- Performance: common dashboard filters (drafts/admin).
create index if not exists "Job_status_archived_idx"
  on "8fold_test"."Job" ("status", "archived");

