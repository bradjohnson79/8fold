-- LGS: Add auto_import_source to discovery_runs (for website import flow)
alter table directory_engine.discovery_runs
  add column if not exists auto_import_source text;
