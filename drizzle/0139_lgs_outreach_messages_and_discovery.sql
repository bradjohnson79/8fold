-- LGS Outreach Messages + Discovery Agent + Contractor Leads extensions
-- Schema: directory_engine
-- Safe to run multiple times (uses IF NOT EXISTS for tables/columns).

-- outreach_messages (GPT-generated messages for contractor_leads)
create table if not exists directory_engine.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references directory_engine.contractor_leads(id),
  subject text,
  body text,
  message_hash text,
  generation_context jsonb,
  generated_by text default 'gpt5-nano',
  status text default 'pending_review',
  created_at timestamptz default now(),
  reviewed_at timestamptz,
  reviewer text
);

-- lgs_outreach_queue (approved messages to send)
create table if not exists directory_engine.lgs_outreach_queue (
  id uuid primary key default gen_random_uuid(),
  outreach_message_id uuid not null references directory_engine.outreach_messages(id),
  lead_id uuid not null references directory_engine.contractor_leads(id),
  priority int default 5,
  sender_account text,
  send_status text default 'pending',
  sent_at timestamptz,
  attempts int default 0,
  error_message text,
  created_at timestamptz default now()
);

-- discovery_runs (bulk domain search stats)
create table if not exists directory_engine.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  domains_processed int default 0,
  successful_domains int default 0,
  emails_found int default 0,
  domains_discarded int default 0,
  emails_scraped int default 0,
  emails_pattern_generated int default 0,
  emails_verified int default 0,
  emails_imported int default 0,
  created_at timestamptz default now()
);

-- discovery_domain_logs (per-domain scan results)
create table if not exists directory_engine.discovery_domain_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references directory_engine.discovery_runs(id),
  domain text,
  emails_found int,
  status text,
  created_at timestamptz default now()
);

-- discovery_domain_cache (dedup: skip domain if scanned in last 30 days)
create table if not exists directory_engine.discovery_domain_cache (
  domain text primary key,
  last_discovered_at timestamptz not null
);

-- discovery_run_leads (staging: found leads before import into contractor_leads)
create table if not exists directory_engine.discovery_run_leads (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references directory_engine.discovery_runs(id),
  domain text,
  email text not null,
  business_name text,
  verification_score int,
  discovery_method text,
  imported boolean default false,
  created_at timestamptz default now()
);

-- contractor_leads: discovery and verification extensions
alter table directory_engine.contractor_leads
  add column if not exists discovery_method text;

alter table directory_engine.contractor_leads
  add column if not exists lead_source text;

alter table directory_engine.contractor_leads
  add column if not exists verification_source text;

alter table directory_engine.contractor_leads
  add column if not exists domain_reputation text;
