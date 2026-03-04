# Router Rewards

Router rewards use a **ledger + materialized balance** pattern.

## Architecture

- **Ledger** (`v4_router_reward_events`): Immutable event log. Source of truth.
- **Balance** (`router_profiles_v4.rewards_balance_cents`): Materialized summary for fast lookups.

## Update Rule

**`rewards_balance_cents` must only be updated via `routerRewardsService.addRouterReward()`.**

Do not write to the balance column directly. All updates flow through the service, which:

1. Inserts an event into the ledger
2. Atomically increments the balance in the same transaction

This keeps the ledger and balance in sync.

## Event Types (examples)

| event_type    | amount_cents |
| ------------- | ------------ |
| LOGIN         | 50           |
| ROUTED_JOB    | 200          |
| COMPLETED_JOB | 300          |

Callers use `addRouterReward()` when these events occur.
