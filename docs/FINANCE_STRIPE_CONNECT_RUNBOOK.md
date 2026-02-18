# 8Fold Stripe Connect Runbook (Finance)

This runbook is for production operations of Stripe Connect on the 8Fold platform.

Scope:

- Stripe Connect transfers (release legs)
- Webhook reconciliation for transfer lifecycle events
- Payout integrity auditing (TransferRecord vs LedgerEntry vs Escrow)

Out of scope:

- Routing logic
- Support/dispute workflows (except where they touch refund safety rules)
- Any automatic repair (we only provide suggestions)

## 0) Non-negotiables (Safety rails)

- Do not refund after any payout leg has been sent (no clawback exists).
- Do not release funds if a refund has been initiated/completed.
- Do not manually edit production DB financial rows (TransferRecord, LedgerEntry, Escrow). Use audit + reconcile tooling and investigate root cause.

## 1) Test vs Live Mode (STRIPE_MODE)

Env:

- `STRIPE_MODE=test|live` (required for safety)

Enforced behavior:

- If `STRIPE_MODE=live` and `STRIPE_SECRET_KEY` is `sk_test_...` -> boot fails loudly.
- If `STRIPE_MODE=test` and `STRIPE_SECRET_KEY` is `sk_live\_...` -> boot fails loudly.

Boot log:

- `[FINANCE] Stripe mode: LIVE|TEST`

Why:

- Prevent accidental live charges/transfers from test environments (and vice versa).
- Ensure Stripe idempotency keys cannot cross-poison between environments.

## 2) Stripe Dashboard Checklist (Go-Live)

### Connect

- Connect is enabled in LIVE mode for the platform account.
- Destination accounts can receive transfers (payouts enabled).

### Webhooks

- A LIVE webhook endpoint exists and points to:
  - `POST https://<api-origin>/api/webhooks/stripe`
- Subscribed events include at minimum:
  - `transfer.created`
  - `transfer.updated`
  - `transfer.reversed`
  - plus payment-intent/charge events required by escrow funding flows

Notes:

- Stripe docs list `transfer.updated` as metadata/description updates and also reversal field updates. We treat it as a reconciliation signal, not a money-movement trigger.
- Stripe does not provide `transfer.paid` for Transfers; Transfers are not "paid later" objects.

## 3) Idempotency guarantees

Stripe transfer creation uses idempotency keys that include:

- jobId
- role
- amountCents
- currency
- `STRIPE_MODE` discriminator

This prevents test idempotency keys from poisoning live.

## 4) Daily ops: run integrity audit

From repo root:

- `pnpm -C apps/api audit:finance`

Useful flags:

- `--take 1000` (more coverage)
- `--orphanDays 365` (longer orphan scan)

Exit codes:

- `0` -> no CRITICAL violations
- `2` -> CRITICAL violations exist (treat as incident / block deployment)

Optional notification:

- If `FINANCE_AUDIT_WEBHOOK_URL` is set, the audit will POST a summary payload (counts + top violations).

## 5) Admin drilldown & recovery tools

### Integrity drilldown page

- `/payouts/integrity`

Shows:

- deterministic table of violations (severity, jobId, code, message, suggestedAction)
- expandable JSON per row
- "Copy JSON" for incident threads

### Manual reconcile a transfer (webhook recovery)

Endpoint:

- `POST /api/admin/finance/transfers/:transferId/reconcile`

Behavior:

- Retrieves transfer from Stripe
- Finds matching `TransferRecord` by `stripeTransferId`
- Reconciles status only if it is a legal transition
- Returns before/after; never creates records

Use when:

- You suspect webhook delivery issues
- You need to recover state for a single transfer id

## 6) How to interpret violations (manual actions)

### CRITICAL

- `PLATFORM_LEDGER_DRIFT`
  - Meaning: aggregate mismatch between PLATFORM legs and BROKER_FEE ledger credits exceeds threshold.
  - Do:
    - Identify duplicate/missing ledger writes
    - Compare `TransferRecord(role=PLATFORM)` totals vs `LedgerEntry(type=BROKER_FEE,bucket=AVAILABLE,direction=CREDIT)`
    - File incident; do not patch with manual DB edits

### HIGH

- `TRANSFER_LEG_FAILED`
  - Meaning: at least one transfer leg is FAILED.
  - Do:
    - Investigate the Stripe transfer id (from details)
    - Confirm destination account, payouts enabled, and any Stripe error context

- `TRANSFER_LEG_STATUS_NOT_SENT`
  - Meaning: a RELEASED job has any non-SENT leg.
  - Do:
    - Use the reconcile endpoint for the specific Stripe transfer(s)
    - Check webhook logs for illegal transitions or missing TransferRecord anomalies

- `ESCROW_RELEASED_AT_MISSING`
  - Meaning: escrow is marked RELEASED but does not have `releasedAt`.
  - Do:
    - Verify transfers + job releasedAt; investigate why escrow row missed the timestamp update
    - Prefer code-path replay / reconciliation; avoid manual edits

## 7) Safe go-live procedure (test -> live)

1. Ensure test environment is clean:
   - `pnpm -C apps/api audit:finance`
2. Set environment variables for live:
   - `STRIPE_MODE=live`
   - `STRIPE_SECRET_KEY=sk_live\_...`
   - webhook secrets for live endpoints
3. Deploy
4. Confirm boot logs show:
   - `[FINANCE] Stripe mode: LIVE`
5. In Stripe Dashboard (LIVE):
   - Send a test webhook event (or perform a tiny live action in a controlled account)
6. Run:
   - `pnpm -C apps/api audit:finance`
7. Monitor:
   - `/payouts/integrity` counts (CRITICAL/HIGH should remain zero)

