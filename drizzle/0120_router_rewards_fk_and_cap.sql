-- Router rewards: add FK and safety cap on amount_cents.

-- 1. Add foreign key to prevent orphan reward records
ALTER TABLE v4_router_reward_events
  ADD CONSTRAINT fk_router_rewards_router
  FOREIGN KEY (router_user_id)
  REFERENCES router_profiles_v4(user_id)
  ON DELETE CASCADE;

-- 2. Replace CHECK: cap positive values (prevent accidental spikes)
ALTER TABLE v4_router_reward_events
  DROP CONSTRAINT IF EXISTS v4_router_reward_events_amount_cents_check;

ALTER TABLE v4_router_reward_events
  ADD CONSTRAINT v4_router_reward_events_amount_cents_check
  CHECK (amount_cents BETWEEN -100000 AND 100000);
