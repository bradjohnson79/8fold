# Stripe Validation Report

**8Fold Stripe Integration — Financial-Grade Hardening**

This document describes the Stripe integration architecture, idempotency strategy, refund policy, and manual test checklist. The Stripe layer is considered financially hardened after this phase.

---

## 1. Environment Variables

### Required (apps/api)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Platform Stripe secret key (sk_test_* or sk_live\_*) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret for main account (whsec\_*) |
| `INTERNAL_SECRET` | Shared secret for admin API proxy (server-to-server auth) |
| `APP_ADMIN_BASE_URL` | Admin app base URL (e.g. http://localhost:3002) |
| `APP_WEB_BASE_URL` | Web app base URL (e.g. http://localhost:3006) |

### Required (apps/web)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for client-side Stripe Elements |

**Clarification**: The publishable key is safe for browser use. The secret key must **never** exist in apps/web or apps/admin.

### Optional (apps/api)

| Variable | Purpose |
|----------|---------|
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Only if using a separate Connect webhook endpoint |
| `STRIPE_RETURN_URL` | Stripe Connect onboarding return URL |
| `STRIPE_REFRESH_URL` | Stripe Connect onboarding refresh URL |

### Webhook Secret Usage

 - **If using one Stripe CLI forwarder**: Use the printed `whsec\_*` value as `STRIPE_WEBHOOK_SECRET`.
- **If using separate Connect webhook endpoint**: Use `STRIPE_CONNECT_WEBHOOK_SECRET` only for that endpoint.
- **If using a single endpoint for both** platform and Connect events: Only `STRIPE_WEBHOOK_SECRET` is required. No secret duplication is necessary.

---

## 2. Escrow Flow

### Job Escrow (Step-by-Step)

1. **Create PaymentIntent**  
   - `POST /api/web/jobs/[id]/payment-intent`  
   - Auth: Poster must own job  
   - Validates: `paymentStatus` is UNPAID or FAILED, `amountCents > 0`, Stripe minimum (50¢)  
   - Creates Stripe PaymentIntent on **platform account** (no `transfer_data`, no `application_fee_amount`)  
   - Metadata: `{ type: "job_escrow", jobId, posterId }`  
   - Stores `stripePaymentIntentId`, sets `paymentStatus = REQUIRES_ACTION`  
   - Returns `{ ok: true, clientSecret }`

2. **Confirm client-side**  
   - Web uses Stripe Elements + `stripe.confirmPayment({ elements, redirect: "if_required" })`  
   - No server-side confirm-payment mutation; funding is webhook-only

3. **Webhook sets FUNDED**  
   - `POST /api/webhooks/stripe` receives `payment_intent.succeeded`  
   - Idempotency: `StripeWebhookEvent` table, `processedAt` lock  
   - If `metadata.type === "job_escrow"`: sets `paymentStatus = FUNDED`, `fundedAt = now`, `status = OPEN_FOR_ROUTING`

4. **Job becomes routable**  
   - Only when `paymentStatus = FUNDED`  
   - Client polls `GET /api/web/jobs/[id]/payment-status` until FUNDED

### P&M Escrow (Parts & Materials)

- Same pattern: `POST /api/web/parts-materials/[id]/payment-intent`  
- Metadata: `{ type: "pm_escrow", pmId, jobId, posterId }`  
- Webhook sets `PartsMaterialRequest.paymentStatus = FUNDED`, `fundedAt = now`

---

## 3. Payout Flow

### Preconditions

- Job `paymentStatus = FUNDED`
- Job `payoutStatus` in NOT_READY, READY, or RELEASED (idempotent if already RELEASED)
- **Triple confirmation** requires all of the following (exact DB schema field names):
  - `contractorCompletedAt`
  - `customerApprovedAt`
  - `routerApprovedAt`
  - All three timestamps must be non-null before release-funds can execute.
- Contractor: `stripeAccountId` present, `stripePayoutsEnabled === true`
- Router: `stripeAccountId` present, `stripePayoutsEnabled === true`

### Release Process

1. Admin triggers `POST /api/admin/jobs/[id]/release-funds` (via proxy)
2. Row lock: `SELECT ... FOR UPDATE` on Job
3. If `payoutStatus === RELEASED` and both transfer IDs exist → return `{ ok: true, alreadyReleased: true }`
4. Create only missing Stripe transfers (contractor 75%, router 15%, platform remainder)
5. Store `contractorTransferId`, `routerTransferId` in DB immediately
6. Set `payoutStatus = RELEASED`, `releasedAt = now`

### Connect Model

**Separate Charges & Transfers**

- PaymentIntent is created on **platform account**
- No `transfer_data` or `application_fee_amount` on PaymentIntent
- Funds are collected, then `stripe.transfers.create` moves them to Connect accounts
- No destination charges; no mixing of models

---

## 4. Idempotency Strategy

| Layer | Mechanism |
|-------|------------|
| **Webhook** | `StripeWebhookEvent` table: insert `event.id`, atomic `processedAt` update; duplicate events no-op |
| **Release funds** | Row-level `SELECT ... FOR UPDATE`; if RELEASED + transfer IDs exist → early return; create only missing transfers |
| **Transfer IDs** | Stored in DB immediately after `transfers.create`; never recreate existing transfer |
| **Refund** | Check `paymentStatus === REFUNDED` before Stripe refund; return `alreadyRefunded` if already done |

---

## 5. Refund Policy

### Allowed

- Only when `paymentStatus = FUNDED`
- Only when `payoutStatus !== RELEASED`
- Sets `paymentStatus = REFUNDED`, `refundedAt = now`
- **Does not** set `releasedAt` (refund is distinct from payout release)

### Blocked

- If `payoutStatus === RELEASED` → `{ ok: false, error: "Cannot refund after payout release" }`
- No clawback logic exists; refund after release is not supported

### Webhook

- `charge.refunded` (Stripe-initiated, e.g. dispute): sets `paymentStatus = REFUNDED`, `refundedAt = now`

---

## 6. Manual Test Checklist

### Happy Path

- [ ] Create job (draft → pricing → payment step)
- [ ] Pay with Stripe test card (4242 4242 4242 4242)
- [ ] Webhook fires → job `paymentStatus = FUNDED`, `status = OPEN_FOR_ROUTING`
- [ ] Router routes → contractor accepts → completes → triple confirm
- [ ] Admin: Release Funds → transfers created, `payoutStatus = RELEASED`

### Failure Paths

- [ ] **Payment fails**: Use card 4000 0000 0000 0002 → job remains UNPAID/FAILED
- [ ] **Webhook retry**: Re-send same event → no double-update (idempotent)
- [ ] **Double release**: Call release-funds twice → second returns `alreadyReleased`, no double transfers
- [ ] **Refund after release**: Attempt refund when `payoutStatus = RELEASED` → blocked with "Cannot refund after payout release"

---

## 7. Stripe CLI Commands

```bash
# Forward webhooks to local API
stripe listen --forward-to localhost:3003/api/webhooks/stripe
```

Set `STRIPE_WEBHOOK_SECRET` to the secret printed by `stripe listen` for local testing.

---

## 8. Logging (Never Log Secrets)

Structured logs emitted:

- `[STRIPE_RELEASE_ATTEMPT]` — jobId, contractorId, routerId, performedByAdminId
- `[STRIPE_REFUND]` — jobId, refundId, performedByAdminId

**Never logged**: Full Stripe objects, card data, secrets, raw API responses.

---

## 9. Admin Proxy Boundary

- Browser never calls localhost:3003 directly.
- All admin calls go to apps/admin (port 3002).
- apps/admin injects:
  - `x-admin-id`
  - `x-internal-secret`
- apps/api validates with `verifyInternalAdmin(req)`.
- No cookie-based admin authentication in apps/api.
- `INTERNAL_SECRET` must match in both apps.

This preserves institutional memory and prevents 401 regressions.

---

## 10. Known Limitations

- No clawback after payout release.
- Refund blocked if `payoutStatus === RELEASED`.
- No partial refunds implemented.
- Multi-currency not supported beyond CAD baseline.

---

## 11. Operational Safeguards

- `stripePayoutsEnabled` must be true before release.
- Zero-amount PaymentIntent blocked.
- Stripe minimum amount enforced.
- Webhook idempotent.
- Row-level locking on release.
- Transfer IDs persisted immediately.
