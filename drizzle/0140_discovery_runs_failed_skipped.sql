-- LGS: Add failed_domains, skipped_domains, domains_total to discovery_runs
alter table directory_engine.discovery_runs
  add column if not exists domains_total int default 0;

alter table directory_engine.discovery_runs
  add column if not exists failed_domains int default 0;

alter table directory_engine.discovery_runs
  add column if not exists skipped_domains int default 0;

alter table directory_engine.discovery_runs
  add column if not exists status text default 'running';
