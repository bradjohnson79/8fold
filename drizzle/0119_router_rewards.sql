-- Router rewards: immutable event ledger + materialized balance.
-- Ledger is source of truth; balance is fast summary. Updates only via routerRewardsService.

CREATE TABLE v4_router_reward_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  router_user_id text NOT NULL,
  event_type text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= -100000),
  job_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_router_reward_events_user
  ON v4_router_reward_events (router_user_id);

ALTER TABLE router_profiles_v4
  ADD COLUMN rewards_balance_cents integer NOT NULL DEFAULT 0;
