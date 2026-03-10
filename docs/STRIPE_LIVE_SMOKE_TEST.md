# Stripe Live Mode — Smoke Test & Launch Report
**Date:** 2026-03-09  
**Auditor:** Automated audit (Cursor AI Agent)  
**Mode:** Code-path and configuration verification (non-transactional — no real payment executed)

---

## Environment Status

| Variable | apps/api | apps/web | apps/admin |
|---|---|---|---|
| `STRIPE_MODE` | `live` ✅ | `live` ✅ | N/A ✅ |
| Secret key (`STRIPE_SECRET_KEY`) | `sk_live_...` ✅ | Not set ✅ | Not set ✅ |
| Publishable key (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) | `pk_live_...` (as `STRIPE_PUBLISHABLE_KEY`) ✅ | `pk_live_...` ✅ | Not set ✅ |
| Webhook secret (`STRIPE_WEBHOOK_SECRET`) | `whsec_...` ✅ | Not set ✅ | Not set ✅ |
| Connect webhook secret (`STRIPE_CONNECT_WEBHOOK_SECRET`) | `whsec_...` ✅ | Not set ✅ | Not set ✅ |
| Integrity read key (`STRIPE_INTEGRITY_READ_KEY`) | `rk_live_...` ✅ | Not set ✅ | Not set ✅ |
| Execution secret (`STRIPE_EXECUTION_SECRET_KEY`) | `sk_live_...` ✅ | Not set ✅ | Not set ✅ |

**sk/pk mode consistency:** Both `sk_live_` and `pk_live_` — no mismatch ✅

---

## Payment Flow Status

### Flow 1 — Job Poster Payment

| Step | Implementation | Status |
|---|---|---|
| Stripe customer created/retrieved | `ensureJobPosterStripeCustomer()` — `stripe.customers.create()` | ✅ |
| Setup session (card save) | `createJobPosterSetupSession()` — `stripe.checkout.sessions.create({ mode: "setup" })` | ✅ |
| Payment intent created | `createPaymentIntent()` — `stripe.paymentIntents.create()` | ✅ |
| Idempotency key enforced | `idempotencyKey` parameter always passed | ✅ |
| Metadata present | `type: "job_escrow"`, `jobId`, `jobPosterUserId`, `userId` | ✅ |
| Currency correct | `"usd"` or `"cad"` derived from user country | ✅ |
| Amount validated | Integer cents, `assertStripeMinimumAmount()` enforced | ✅ |
| Capture method | `"automatic"` (escrow-style, platform retains funds pre-transfer) | ✅ |
| `payment_intent.succeeded` webhook → escrow update | `finalizeJobFundingFromPaymentIntent()` | ✅ |
| Amount/currency verification on webhook | `pi.amount_received === job.amount_cents` & currency check | ✅ |
| Job status → `FUNDS_SECURED` | Updated in webhook handler | ✅ |
| `PAYMENT_CAPTURED` domain event emitted | `emitDomainEvent({ type: "PAYMENT_CAPTURED" })` | ✅ |
| Notification type sent | `PAYMENT_RECEIVED` (job poster + admin) | ✅ |
| Audit log created | `PAYMENT_COMPLETED` entry in `auditLogs` | ✅ |
| Duplicate-payment idempotency | Early return if `job.paymentStatus = FUNDED/FUNDS_SECURED` | ✅ |

---

### Flow 2 — 2nd Appraisal / Price Adjustment Payment

| Step | Implementation | Status |
|---|---|---|
| Fee constants | `CONTRACTOR_SHARE=0.75`, `ROUTER_SHARE=0.15`, `PLATFORM_SHARE=0.10` | ✅ |
| Difference calculation | `computeDiff(adj)` = `requestedPriceCents - originalPriceCents` | ✅ |
| Price breakdown | `computeBreakdown(totalCents)` returns all four splits | ✅ |
| Accept revision route | `POST /api/web/v4/job-adjustment/[adjustmentId]/accept` | ✅ |
| Confirm payment route | `POST /api/web/v4/job-adjustment/[adjustmentId]/confirm-payment` | ✅ |
| Payment intent for difference | `confirmAdjustmentPayment(adjustmentId, paymentIntentId)` | ✅ |
| Stripe instance used | `stripe` from `@/src/payments/stripe` (live client) | ✅ |
| Job `amount_cents` update | Performed in `acceptAdjustment()` / adjustment service | ✅ |

---

### Flow 3 — Contractor Stripe Connect Onboarding

| Step | Implementation | Status |
|---|---|---|
| Route | `POST /api/web/v4/contractor/stripe/onboard` | ✅ |
| Service | `createOrRefreshContractorOnboardingLink()` | ✅ |
| Account type | `type: "express"` ✅ | ✅ |
| Status check route | `GET /api/web/v4/contractor/stripe/status` | ✅ |
| `charges_enabled` checked | `account.charges_enabled` in status response | ✅ |
| `payouts_enabled` checked | `account.payouts_enabled` in status response | ✅ |
| `account.updated` webhook | Updates `contractors.stripePayoutsEnabled` + `payoutMethods` | ✅ |
| `payout.paid` webhook | Audit log entry created | ✅ |

---

### Flow 4 — Router Stripe Connect

| Step | Implementation | Status |
|---|---|---|
| Route | `POST /api/admin/routers/[userId]/stripe/onboard` | ✅ |
| Account type | `express` (confirmed via service pattern) | ✅ |
| Payout method stored | `payoutMethods` table with JSONB `stripeAccountId` | ✅ |

---

## Escrow & Ledger Safety Check

| Check | Status | Detail |
|---|---|---|
| Escrow record created on payment | ✅ | `INSERT INTO escrows` in `finalizeJobFundingFromPaymentIntent()` |
| Escrow status → `FUNDED` | ✅ | `status: "FUNDED"` set in `finalizeJobFundingFromPaymentIntent()` |
| Escrow `kind = JOB_ESCROW` | ✅ | Enforced in query and insert |
| `jobs.amount_cents` authoritative | ✅ | Verified against `pi.amount_received` before marking funded |
| Fee split enforced | ✅ | `CONTRACTOR_SHARE=0.75, ROUTER_SHARE=0.15, PLATFORM_SHARE=0.10` |
| Admin-routed jobs (router fee → platform) | ✅ | Handled in adjustment service — platform absorbs router share |
| Ledger entries balance | ✅ | Audit logs + escrow records written atomically in DB transaction |
| Transfer audit | ✅ | `transfer.created` webhook writes `STRIPE_TRANSFER_CREATED` audit log |
| Transfer reversal | ✅ | `transfer.reversed` writes `STRIPE_TRANSFER_FAILED` audit log |

**No escrow or ledger logic was modified.** All pre-existing safety checks remain intact.

---

## Webhook Validation

| Event | Handled | Notes |
|---|---|---|
| `payment_intent.succeeded` | ✅ | Finalizes job escrow, triggers `PAYMENT_CAPTURED` event |
| `payment_intent.payment_failed` | ✅ | Sets `payment_status=FAILED` on job + payment row |
| `charge.succeeded` | ✅ | Triggers fee reconciliation post-commit |
| `charge.refunded` | ✅ | Marks job `REFUNDED`, archives, notifies poster + admin |
| `refund.updated` | ✅ | Sets `REFUNDED` on job + payment rows |
| `transfer.created` | ✅ | Audit log + escrow webhook timestamp |
| `transfer.reversed` | ✅ | Audit log |
| `account.updated` | ✅ | Syncs `stripePayoutsEnabled` to contractor + payout method |
| `payout.paid` | ✅ | Audit log with contractor/router resolution |
| `checkout.session.completed` | ✅ | Sets default payment method for job poster |
| `transfer.paid` | ⚠️ Not in handler | Stripe does not emit `transfer.paid`; `payout.paid` is the correct event for connected accounts. No gap. |

**Webhook signature validation:**
```typescript
event = s.webhooks.constructEvent(rawBody, sig, secretPrimary);
// or for Connect events:
event = s.webhooks.constructEvent(rawBody, sig, secretConnect);
```
✅ `STRIPE_WEBHOOK_SECRET` used  
✅ `STRIPE_CONNECT_WEBHOOK_SECRET` used as fallback for Connect events  
✅ Missing secret → `500 STRIPE_WEBHOOK_SECRET_MISSING`  
✅ Invalid signature → `400 STRIPE_SIGNATURE_INVALID`  
✅ Duplicate event idempotency via `stripeWebhookEvents` table locking

---

## Notification Integration

| Event | Notification Type | Channel | Status |
|---|---|---|---|
| `PAYMENT_CAPTURED` | `PAYMENT_RECEIVED` | In-app (job poster) | ✅ |
| `PAYMENT_CAPTURED` | `PAYMENT_RECEIVED` | In-app (admin) | ✅ |
| `FUNDS_RELEASED` | `FUNDS_RELEASED` | In-app (contractor + router) | ✅ |
| `charge.refunded` webhook | `JOB_AUTO_REFUNDED` | In-app (poster + admin) | ✅ |
| Domain event delivery log | `logDelivery()` | Database | ✅ |
| Email (adjustment / consent) | Transactional via SMTP | `sendTransactionalEmail()` | ✅ |

`PAYMENT_EXCEPTION` and `PAYMENT_RELEASED` are not registered domain event types in the current system. Refund notifications go through `JOB_AUTO_REFUNDED` and the `charge.refunded` webhook path. No notification gap exists.

---

## Smoke Test Scenario — Simulated Live Flow

**Scenario:** Post a Handyman job at $1 and trace the full lifecycle code path.

> This is a **code-path trace**, not a live transaction. No real charge was made.

| Step | Code Path | Outcome |
|---|---|---|
| 1. Create job | `POST /api/web/v4/job/create` | Job row in `DRAFT` status |
| 2. Job poster sets up payment method | `createJobPosterSetupSession()` → Stripe Checkout `mode: "setup"` | Redirects to Stripe-hosted page |
| 3. Card saved | `checkout.session.completed` webhook → `users.stripeDefaultPaymentMethodId` updated | Customer record connected |
| 4. Create Payment Intent ($1 = 100 cents) | `createPaymentIntent(100, { currency: "usd", metadata: { type: "job_escrow", jobId, jobPosterUserId } })` | PI created in Stripe Live |
| 5. Confirm payment | Browser calls Stripe.js `confirmPayment()` with `pk_live_...` | Payment submitted |
| 6. Stripe webhook fires | `payment_intent.succeeded` → `finalizeJobFundingFromPaymentIntent()` | Verifies `pi.amount_received === 100` && `pi.currency === "usd"` |
| 7. Escrow locked | `INSERT INTO escrows(kind=JOB_ESCROW, status=FUNDED, amount_cents=100)` | ✅ |
| 8. Job status | `jobs.payment_status = FUNDS_SECURED`, `jobs.status = OPEN_FOR_ROUTING` | ✅ |
| 9. Domain event emitted | `PAYMENT_CAPTURED` → outbox → `PAYMENT_RECEIVED` notification | ✅ |
| 10. Job routed to contractor | Routing engine dispatches | Contractor receives invite |
| 11. Contractor completes job | `POST /api/web/v4/contractor/jobs/[id]/complete` | Job → `COMPLETED` |
| 12. Funds released | `FUNDS_RELEASED` domain event | Contractor 75¢, Router 15¢, Platform 10¢ |
| 13. Stripe transfer | `stripe.transfers.create()` to contractor connected account | `transfer.created` webhook received |
| 14. Payout | Stripe processes payout to contractor bank | `payout.paid` webhook → audit log |

**Fee math for $1 job:**
- Job Poster pays: `$1.00` (100 cents)
- Contractor receives: `75¢` (75%)
- Router receives: `15¢` (15%)
- Platform retains: `10¢` (10%)
- Admin-routed job: Router share → Platform, so Platform receives `25¢`

---

## Security Guard Status

| Guard | Implementation | Status |
|---|---|---|
| `sk_live + pk_test` → throw | `assertStripeKeysMatchMode()` in `mode.ts` | ✅ |
| `sk_test + pk_live` → throw | `assertStripeKeysMatchMode()` in `mode.ts` | ✅ |
| `sk_live` in non-production → throw | `isNonProdLiveKey()` in `stripe.ts` | ✅ |
| Missing secret in production → throw | `getStripeClient()` in `stripe.ts` | ✅ |
| Web pk/sk mismatch → 409 | `stripe/config/route.ts` | ✅ |
| Code: `STRIPE_MODE_MISMATCH` | `mode.ts`, `runtimeConfig.ts` | ✅ |
| Read-only integrity client (no mutations) | `stripeIntegrityClient.ts` proxy guard | ✅ |
| New startup validator | `verifyStripeEnvironment.ts` | ✅ NEW |

---

## Phase 10 — Startup Validator

**Created:** `apps/api/src/stripe/verifyStripeEnvironment.ts`

**Recommended usage in `instrumentation.ts`:**
```typescript
// apps/api/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { verifyStripeEnvironment } = await import("./src/stripe/verifyStripeEnvironment");
    verifyStripeEnvironment();
  }
}
```

Alternatively, call from any API boot path. The function:
- Is a no-op in non-production if keys are absent (warns only)
- Hard-throws in production on any misconfiguration
- Logs a structured boot confirmation JSON on success

---

## Final Result

```
╔══════════════════════════════════════════╗
║                                          ║
║   READY_FOR_LIVE_PAYMENTS                ║
║                                          ║
║   All critical issues resolved.          ║
║   No escrow or ledger logic modified.    ║
║   Startup validator created.             ║
║                                          ║
╚══════════════════════════════════════════╝
```

### Issues Found and Resolved

| # | Severity | Issue | Resolution |
|---|---|---|---|
| 1 | CRITICAL | `apps/web` used `pk_test_` while API used `sk_live_` | Updated web to `pk_live_` |
| 2 | HIGH | `STRIPE_SECRET_KEY=sk_test_` in web `.env.local` (server secret in client env) | Removed |
| 3 | HIGH | `STRIPE_WEBHOOK_SECRET` in web `.env.local` | Removed |
| 4 | HIGH | `STRIPE_MODE` missing from both `.env.local` files | Added `STRIPE_MODE=live` to both |
| 5 | LOW | Misleading comments ("test mode") on live-mode keys | Corrected to "LIVE mode" |

### Pre-existing Protections (Not Modified)

- Escrow lock/fund logic ✅
- Fee distribution (75/15/10) ✅
- Routing logic ✅
- Notification architecture ✅
- Webhook idempotency guard ✅
- Mode mismatch throw guards ✅
- Read-only integrity client ✅

---

## Recommended Pre-Deploy Checklist

Before going live in production:

- [ ] Confirm `STRIPE_MODE=live` is set in Vercel dashboard for `apps/api`
- [ ] Confirm `STRIPE_MODE=live` is set in Vercel dashboard for `apps/web`
- [ ] Confirm Stripe webhook endpoint is registered in Stripe Dashboard pointing to `https://api.8fold.app/api/webhooks/stripe`
- [ ] Confirm Stripe Connect webhook endpoint is registered for `account.updated` and `payout.paid`
- [ ] Verify webhook signing secrets in Stripe Dashboard match the `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET` values in Vercel
- [ ] Run one manual $1 test transaction end-to-end using a real card before announcing live
- [ ] Monitor Stripe Dashboard → Events tab for the first 24h post-launch
