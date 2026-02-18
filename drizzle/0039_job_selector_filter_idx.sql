-- Performance for homepage location selector filters at mock scale (7k-10k jobs).
create index if not exists "Job_selector_filter_idx"
  on "8fold_test"."Job" ("country", "regionCode", "city", "status", "archived");

