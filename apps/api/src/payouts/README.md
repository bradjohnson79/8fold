# Finance Ops: Payout Integrity

This folder contains finance-owned audit logic and CI-safe scripts for catching financial drift between:

- `TransferRecord` (release legs)
- `LedgerEntry` (accounting evidence)
- `Escrow` (escrow invariants)

## Run the audit (recommended)

From repo root:

- `pnpm -C apps/api audit:finance`

Exit codes:

- `0`: no CRITICAL violations
- `2`: one or more CRITICAL violations (CI should fail)
- `1`: script/runtime error (misconfig, DB unreachable, etc)

Args (optional):

- `--take 500` (default 500)
- `--orphanDays 180` (default 180)
- `--maxExamples 10` (default 10)

Example:

- `pnpm -C apps/api audit:finance -- --take 1000 --orphanDays 365`

## Notification hook (dev-safe)

If you set `FINANCE_AUDIT_WEBHOOK_URL`, the audit will POST a small summary payload:

- counts of CRITICAL/HIGH
- top 10 jobIds + violation codes (deterministic ordering)

If unset, it is a no-op.

## Stripe mode safety

Set `STRIPE_MODE` to prevent test/live mixing:

- `STRIPE_MODE=test` requires `sk_test_...`
- `STRIPE_MODE=live` requires `sk_live_...`

Boot prints:

- `[FINANCE] Stripe mode: LIVE|TEST`

## Admin drilldown

- Badge: `/payouts` (shows count)
- Drilldown: `/payouts/integrity` (lists violations from backend payload)

## Schema / migrations

Phase-2 added:

- `Escrow.releasedAt` via `drizzle/0043_escrow_released_at.sql`

Apply migrations before relying on the escrow releasedAt invariants.

