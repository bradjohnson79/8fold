-- LGS Lead Management Refactor
-- Adds lead_number, email_type, import_domain_metadata, import_status/skip_reason,
-- and standardized discovery counters (Emails Found, Qualified, Inserted, Duplicates, Rejected).
-- Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS for columns).

-- contractor_leads: sequential lead number via sequence
create sequence if not exists directory_engine.contractor_leads_lead_number_seq;

alter table directory_engine.contractor_leads
  add column if not exists lead_number integer default nextval('directory_engine.contractor_leads_lead_number_seq');

-- Backfill existing rows with sequential lead_number ordered by created_at
do $$
begin
  if exists (
    select 1 from directory_engine.contractor_leads where lead_number is null limit 1
  ) then
    with ranked as (
      select id, row_number() over (order by created_at asc) as rn
      from directory_engine.contractor_leads
      where lead_number is null
    )
    update directory_engine.contractor_leads cl
    set lead_number = r.rn + coalesce(
      (select max(lead_number) from directory_engine.contractor_leads where lead_number is not null),
      0
    )
    from ranked r
    where cl.id = r.id;
  end if;
end $$;

-- email_type: business | free_provider | disposable | unknown
alter table directory_engine.contractor_leads
  add column if not exists email_type text;

-- discovery_runs: import domain metadata (city/state per domain from CSV/XLSX)
alter table directory_engine.discovery_runs
  add column if not exists import_domain_metadata jsonb;

-- discovery_runs: standardized terminology counters
alter table directory_engine.discovery_runs
  add column if not exists qualified_emails integer default 0;

alter table directory_engine.discovery_runs
  add column if not exists inserted_leads integer default 0;

alter table directory_engine.discovery_runs
  add column if not exists duplicates_skipped integer default 0;

alter table directory_engine.discovery_runs
  add column if not exists rejected_emails integer default 0;

-- discovery_run_leads: explicit import outcome tracking
alter table directory_engine.discovery_run_leads
  add column if not exists import_status text default 'pending';

alter table directory_engine.discovery_run_leads
  add column if not exists skip_reason text;

-- Index for fast lead_number lookups
create index if not exists contractor_leads_lead_number_idx
  on directory_engine.contractor_leads (lead_number);
