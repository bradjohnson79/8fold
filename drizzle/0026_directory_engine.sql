-- DISE (Directory Intelligence & Submission Engine)
-- Schema: directory_engine
-- Safe to run multiple times.

create schema if not exists directory_engine;

create table if not exists directory_engine.directories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  homepage_url text,
  submission_url text,
  contact_email text,
  region text,
  country text,
  category text,
  free boolean,
  requires_approval boolean,
  authority_score integer,
  status text not null default 'NEW',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists directory_engine.regional_context (
  id uuid primary key default gen_random_uuid(),
  region text not null unique,
  country text,
  key_industries jsonb,
  top_trades jsonb,
  service_demand jsonb,
  population_traits jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists directory_engine.submissions (
  id uuid primary key default gen_random_uuid(),
  directory_id uuid not null references directory_engine.directories(id),
  region text,
  generated_variants jsonb,
  selected_variant text,
  status text not null default 'DRAFT',
  listing_url text,
  submitted_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists directory_engine.backlinks (
  id uuid primary key default gen_random_uuid(),
  directory_id uuid not null references directory_engine.directories(id),
  listing_url text,
  verified boolean not null default false,
  last_checked timestamptz,
  created_at timestamptz not null default now()
);
