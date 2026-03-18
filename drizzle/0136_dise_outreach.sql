-- DISE Outreach Engine (contractor recruitment emails)
-- Schema: directory_engine
-- Safe to run multiple times.

create table if not exists directory_engine.contractor_contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  job_position text,
  trade_category text,
  location text,
  email text not null,
  website text,
  notes text,
  status text not null default 'pending',
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists directory_engine.email_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references directory_engine.contractor_contacts(id),
  subject text not null,
  body text not null,
  hash text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists directory_engine.email_queue (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references directory_engine.email_messages(id),
  contact_id uuid not null references directory_engine.contractor_contacts(id),
  sender_account text,
  scheduled_time timestamptz,
  send_status text not null default 'pending',
  sent_at timestamptz,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);
