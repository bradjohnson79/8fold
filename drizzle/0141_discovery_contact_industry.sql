-- LGS: Add contact_name, industry to discovery_run_leads; contacts_found to discovery_runs
alter table directory_engine.discovery_run_leads
  add column if not exists contact_name text;

alter table directory_engine.discovery_run_leads
  add column if not exists industry text;

alter table directory_engine.discovery_runs
  add column if not exists contacts_found int default 0;
