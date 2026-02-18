-- Performance: Admin overview filters (status + age).
create index if not exists "Job_admin_overview_idx"
  on "8fold_test"."Job" ("status", "archived", "createdAt");

