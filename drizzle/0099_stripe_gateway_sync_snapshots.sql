create table if not exists stripe_events_log (
  id text primary key,
  type text not null,
  object_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists stripe_events_log_type_idx on stripe_events_log(type);
create index if not exists stripe_events_log_received_at_idx on stripe_events_log(received_at desc);

create table if not exists stripe_payment_intent_snapshots (
  id text primary key,
  status text not null,
  amount integer not null default 0,
  currency text not null default 'usd',
  customer_id text,
  latest_charge_id text,
  created_unix integer,
  job_id text,
  metadata jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now()
);

create index if not exists stripe_pi_snapshots_status_idx on stripe_payment_intent_snapshots(status);
create index if not exists stripe_pi_snapshots_created_unix_idx on stripe_payment_intent_snapshots(created_unix desc);
create index if not exists stripe_pi_snapshots_job_idx on stripe_payment_intent_snapshots(job_id);
create index if not exists stripe_pi_snapshots_last_synced_idx on stripe_payment_intent_snapshots(last_synced_at desc);

create table if not exists stripe_charge_snapshots (
  id text primary key,
  payment_intent_id text,
  status text not null,
  amount integer not null default 0,
  amount_refunded integer not null default 0,
  currency text not null default 'usd',
  created_unix integer,
  job_id text,
  metadata jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now()
);

create index if not exists stripe_charge_snapshots_status_idx on stripe_charge_snapshots(status);
create index if not exists stripe_charge_snapshots_created_unix_idx on stripe_charge_snapshots(created_unix desc);
create index if not exists stripe_charge_snapshots_pi_idx on stripe_charge_snapshots(payment_intent_id);
create index if not exists stripe_charge_snapshots_job_idx on stripe_charge_snapshots(job_id);
create index if not exists stripe_charge_snapshots_last_synced_idx on stripe_charge_snapshots(last_synced_at desc);

create table if not exists stripe_transfer_snapshots (
  id text primary key,
  status text not null,
  amount integer not null default 0,
  currency text not null default 'usd',
  destination_account_id text,
  source_transaction_id text,
  created_unix integer,
  job_id text,
  metadata jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now()
);

create index if not exists stripe_transfer_snapshots_status_idx on stripe_transfer_snapshots(status);
create index if not exists stripe_transfer_snapshots_created_unix_idx on stripe_transfer_snapshots(created_unix desc);
create index if not exists stripe_transfer_snapshots_dest_idx on stripe_transfer_snapshots(destination_account_id);
create index if not exists stripe_transfer_snapshots_job_idx on stripe_transfer_snapshots(job_id);
create index if not exists stripe_transfer_snapshots_last_synced_idx on stripe_transfer_snapshots(last_synced_at desc);

create table if not exists stripe_refund_snapshots (
  id text primary key,
  charge_id text,
  payment_intent_id text,
  status text not null,
  amount integer not null default 0,
  currency text not null default 'usd',
  reason text,
  created_unix integer,
  job_id text,
  metadata jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now()
);

create index if not exists stripe_refund_snapshots_status_idx on stripe_refund_snapshots(status);
create index if not exists stripe_refund_snapshots_created_unix_idx on stripe_refund_snapshots(created_unix desc);
create index if not exists stripe_refund_snapshots_charge_idx on stripe_refund_snapshots(charge_id);
create index if not exists stripe_refund_snapshots_pi_idx on stripe_refund_snapshots(payment_intent_id);
create index if not exists stripe_refund_snapshots_job_idx on stripe_refund_snapshots(job_id);
create index if not exists stripe_refund_snapshots_last_synced_idx on stripe_refund_snapshots(last_synced_at desc);

create table if not exists stripe_sync_runs (
  id text primary key,
  mode text not null,
  from_at timestamptz not null,
  to_at timestamptz not null,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  duration_ms integer not null default 0,
  triggered_by text,
  created_at timestamptz not null default now()
);

create index if not exists stripe_sync_runs_mode_idx on stripe_sync_runs(mode);
create index if not exists stripe_sync_runs_created_at_idx on stripe_sync_runs(created_at desc);
create index if not exists stripe_sync_runs_window_idx on stripe_sync_runs(from_at, to_at);
