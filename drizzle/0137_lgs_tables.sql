-- 8Fold LGS (Lead Generation System) tables
-- Schema: directory_engine
-- Safe to run multiple times (uses IF NOT EXISTS).

-- contractor_leads (primary lead CRM)
create table if not exists directory_engine.contractor_leads (
  id uuid primary key default gen_random_uuid(),
  lead_name text,
  business_name text,
  email text not null,
  website text,
  phone text,
  trade text,
  city text,
  state text,
  source text,
  status text not null default 'new',
  campaign_id uuid,
  contact_attempts integer not null default 0,
  email_date timestamptz,
  email_copy text,
  response_received boolean not null default false,
  signed_up boolean not null default false,
  lead_score integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contractor_leads_email_idx
  on directory_engine.contractor_leads (lower(email));

create index if not exists contractor_leads_city_idx
  on directory_engine.contractor_leads (city);

create index if not exists contractor_leads_source_idx
  on directory_engine.contractor_leads (source);

create index if not exists contractor_leads_status_idx
  on directory_engine.contractor_leads (status);

-- region_launches (expansion tracker)
create table if not exists directory_engine.region_launches (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  status text not null,
  leads integer not null default 0,
  contractors integer not null default 0,
  created_at timestamptz not null default now()
);

-- acquisition_channels (with cost for ROI)
create table if not exists directory_engine.acquisition_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  cost_cents integer default 0,
  created_at timestamptz not null default now()
);

-- Seed acquisition channels
insert into directory_engine.acquisition_channels (name) values
  ('Google Maps Scraping'),
  ('Yelp Discovery'),
  ('Facebook Groups'),
  ('LinkedIn'),
  ('Reddit'),
  ('Paid Ads')
on conflict (name) do nothing;
