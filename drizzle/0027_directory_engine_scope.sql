-- DISE: Add scope + targetUrlOverride to directories, country_context table, submission targetUrlOverride

alter table directory_engine.directories
  add column if not exists scope text default 'REGIONAL',
  add column if not exists target_url_override text;

create table if not exists directory_engine.country_context (
  id uuid primary key default gen_random_uuid(),
  country text not null unique,
  key_industries jsonb,
  workforce_trends jsonb,
  trade_demand jsonb,
  updated_at timestamptz not null default now()
);

alter table directory_engine.submissions
  add column if not exists target_url_override text;
