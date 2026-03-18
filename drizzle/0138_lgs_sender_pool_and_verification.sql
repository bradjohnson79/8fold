-- LGS Sender Pool + Email Verification + Bounce tracking
-- Schema: directory_engine
-- Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS for columns).

-- sender_pool
create table if not exists directory_engine.sender_pool (
  id uuid primary key default gen_random_uuid(),
  sender_email text not null unique,
  daily_limit integer not null default 50,
  sent_today integer not null default 0,
  last_sent_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- contractor_leads: add verification and bounce columns
alter table directory_engine.contractor_leads
  add column if not exists verification_score integer default 0;

alter table directory_engine.contractor_leads
  add column if not exists verification_status text;

alter table directory_engine.contractor_leads
  add column if not exists email_bounced boolean default false;

alter table directory_engine.contractor_leads
  add column if not exists bounce_reason text;

-- Index for time-based reports (weekly charts, growth metrics, funnel)
create index if not exists contractor_leads_created_idx
  on directory_engine.contractor_leads (created_at);

-- Seed sender pool
insert into directory_engine.sender_pool (sender_email, daily_limit) values
  ('info@8fold.app', 50),
  ('support@8fold.app', 50),
  ('hello@8fold.app', 50),
  ('partners@8fold.app', 50)
on conflict (sender_email) do nothing;
