# 8Fold Production Boundary Audit — Financial Lifecycle

**Date:** 2025-02-21  
**Mode:** Production Boundary Audit  
**Scope:** All financial state transitions, auth guards, atomicity, mixed-auth risks

---

## 1. Financial Surface Map

| File | Route | Auth Guard | Financial Action | Notes |
|------|-------|------------|------------------|-------|
| `apps/api/app/api/webhooks/stripe/route.ts` | `POST /api/webhooks/stripe` | **none** (Stripe signature) | Finalize job funding, PM funding; refund handling | Idempotent via `stripeWebhookEvents` insert + lock |
| `apps/api/app/api/job-draft/payment-intent/route.ts` | `POST /api/job-draft/payment-intent` | requireJobPoster (Clerk) | Create Stripe PaymentIntent | Idempotency key: `job-draft-v3:{draftId}` |
| `apps/api/app/api/job-draft/submit/route.ts` | `POST /api/job-draft/submit` | requireJobPoster (Clerk) | Create job with PI; no escrow yet | Webhook finalizes funding |
| `apps/api/app/api/web/job-poster/jobs/[id]/confirm-payment/route.ts` | `POST /api/web/job-poster/jobs/:id/confirm-payment` | requireJobPosterReady (Clerk) | **Deprecated (410)** | Funding via webhook only |
| `apps/api/app/api/web/job-poster/jobs/[id]/confirm-completion/route.ts` | `POST /api/web/job-poster/jobs/:id/confirm-completion` | requireJobPosterReady (Clerk) | Job status → CUSTOMER_APPROVED | Transaction; no release |
| `apps/api/app/api/web/contractor/jobs/[id]/complete/route.ts` | `POST /api/web/contractor/jobs/:id/complete` | requireContractorReady (Clerk) | Job status → COMPLETED | Transaction; no release |
| `apps/api/app/api/jobs/[id]/router-approve/route.ts` | `POST /api/jobs/:id/router-approve` | requireRouterReady (Clerk) | **releaseJobFunds** | **Not under /api/web/*** |
| `apps/api/app/api/web/job/[jobId]/pm/release-funds/route.ts` | `POST /api/web/job/:jobId/pm/release-funds` | loadPmRouteContext (JOB_POSTER, Clerk) | **releasePmFunds** | PM escrow release |
| `apps/api/app/api/web/job/[jobId]/pm/create-payment-intent/route.ts` | `POST /api/web/job/:jobId/pm/create-payment-intent` | loadPmRouteContext (JOB_POSTER, Clerk) | Create PM PaymentIntent | Idempotent |
| `apps/api/app/api/web/materials-requests/[id]/create-payment-intent/route.ts` | `POST /api/web/materials-requests/:id/create-payment-intent` | requireJobPosterReady (Clerk) | Create materials PI | — |
| `apps/api/app/api/web/materials-requests/[id]/confirm-payment/route.ts` | `POST /api/web/materials-requests/:id/confirm-payment` | requireJobPosterReady (Clerk) | Confirm materials payment | — |
| `apps/api/app/api/admin/jobs/[id]/release/route.ts` | `POST /api/admin/jobs/:id/release` | requireAdminIdentityWithTier + ADMIN_SUPER | **releaseJobFunds** | Tier-gated |
| `apps/api/app/api/admin/jobs/[id]/release-funds/route.ts` | `POST /api/admin/jobs/:id/release-funds` | requireAdmin (no tier) | **releaseJobFunds** | **Weaker than release** |
| `apps/api/app/api/admin/jobs/[id]/refund/route.ts` | `POST /api/admin/jobs/:id/refund` | requireAdminIdentityWithTier + ADMIN_SUPER | **refundJobFunds** | Tier-gated |
| `apps/api/app/api/admin/jobs/[id]/complete/route.ts` | `POST /api/admin/jobs/:id/complete` | requireAdminIdentityWithTier + ADMIN_SUPER | **releaseJobFunds** | Transaction + tier |
| `apps/api/app/api/admin/jobs/[id]/archive/route.ts` | `PATCH /api/admin/jobs/:id/archive` | requireAdminIdentityWithTier + ADMIN_OPERATOR | Set archived=true | No financial mutation |
| `apps/api/app/api/admin/parts-materials/[id]/release-funds/route.ts` | `POST /api/admin/parts-materials/:id/release-funds` | requireAdmin | **501 not implemented** | — |
| `apps/api/app/api/admin/finance/adjustments/route.ts` | `POST /api/admin/finance/adjustments` | requireAdmin | Insert ledger entries | Transaction; AVAILABLE guard |
| `apps/api/app/api/admin/payout-requests/[id]/mark-paid/route.ts` | `POST /api/admin/payout-requests/:id/mark-paid` | requireAdmin | Ledger PAYOUT entries | Transaction |
| `apps/api/app/api/admin/support/disputes/[id]/decision/route.ts` | `POST /api/admin/support/disputes/:id/decision` | requireAdmin | Write dispute decision + enforcement actions | PENDING only; no immediate release |
| `apps/api/app/api/admin/finance/transfers/[transferId]/reconcile/route.ts` | `POST /api/admin/finance/transfers/:id/reconcile` | requireAdmin | Reconcile TransferRecord with Stripe | Read + update status |
| `apps/api/app/api/admin/router/jobs/[jobId]/route/route.ts` | `POST /api/admin/router/jobs/:jobId/route` | requireAdminIdentityWithTier + ADMIN_OPERATOR | Insert ledger (router reward) | Admin routing |

---

## 2. Admin Financial Control Summary

**Do any `/api/admin/*` routes trigger financial transitions?**

**YES.** The following admin routes perform financial actions:

| Route | Action | Guard | Accepts Clerk? |
|-------|--------|-------|----------------|
| `POST /api/admin/jobs/:id/release` | Force escrow release | requireAdminIdentityWithTier + ADMIN_SUPER | Yes (admin_session or Clerk) |
| `POST /api/admin/jobs/:id/release-funds` | Force escrow release | requireAdmin only | Yes (admin_session or Clerk) |
| `POST /api/admin/jobs/:id/refund` | Force refund | requireAdminIdentityWithTier + ADMIN_SUPER | Yes |
| `POST /api/admin/jobs/:id/complete` | Force complete + release | requireAdminIdentityWithTier + ADMIN_SUPER | Yes |
| `POST /api/admin/finance/adjustments` | Modify ledger (CREDIT/DEBIT) | requireAdmin | Yes |
| `POST /api/admin/payout-requests/:id/mark-paid` | Ledger PAYOUT entries | requireAdmin | Yes |
| `POST /api/admin/support/disputes/:id/decision` | Create enforcement actions (PENDING) | requireAdmin | Yes |
| `POST /api/admin/finance/transfers/:id/reconcile` | Reconcile TransferRecord | requireAdmin | Yes |
| `POST /api/admin/router/jobs/:jobId/route` | Ledger insert (router reward) | requireAdminIdentityWithTier + ADMIN_OPERATOR | Yes |

**Admin-only routes do NOT accept non-admin Clerk auth.** `requireAdmin` and `requireAdminIdentityWithTier` both require ADMIN role (admin_session cookie or Clerk JWT with `users.role = ADMIN`). A JOB_POSTER or CONTRACTOR cannot call these endpoints.

**Critical inconsistency:** `release-funds` uses `requireAdmin` (any admin) while `release` and `refund` use `requireAdminIdentityWithTier` + `ADMIN_SUPER`. Two routes perform the same `releaseJobFunds` action with different auth strength.

---

## 3. Atomicity Assessment

| Route | Transaction | Idempotency | Double-submit | Unique constraint |
|-------|-------------|-------------|---------------|-------------------|
| `/api/webhooks/stripe` | **PASS** | **PASS** | **PASS** | `stripeWebhookEvents.id` PK; insert + lock on `processedAt` |
| `releaseJobFunds` (service) | **PASS** | **PASS** | **PASS** | Application-level: `FOR UPDATE` + existing transfer check; `alreadyReleased` |
| `refundJobFunds` (service) | **PASS** | **PASS** | **PASS** | `FOR UPDATE`; `already_refunded` |
| `releasePmFunds` (service) | **PASS** | **PASS** | **PASS** | Application-level: `alreadyReleased` / `RELEASED` check |
| `finalizeJobFundingFromPaymentIntent` | **PASS** | **PASS** | **PASS** | `FUNDED`/`FUNDS_SECURED` early return |
| `finalizePmFunding` | **PASS** | **PASS** | **PASS** | `existingFundLedger` check before insert |
| `/api/admin/finance/adjustments` | **PASS** | **FAIL** | **FAIL** | No unique constraint on ledger; no idempotency key |
| `/api/admin/payout-requests/:id/mark-paid` | **PASS** | **PASS** | **PASS** | `status=REQUESTED` + `payoutId is null` update guard |
| `/api/web/job-poster/jobs/:id/confirm-completion` | **PASS** | **PASS** | **PASS** | `already_released` / `RELEASED` check |
| `/api/web/contractor/jobs/:id/complete` | **PASS** | **PASS** | **PASS** | `already_submitted` check |
| `/api/jobs/:id/router-approve` | **PASS** | **PASS** | **PASS** | Concurrency guard; `releaseJobFunds` idempotent |
| `TransferRecord` | — | — | **WARN** | No unique constraint on `(jobId, role)`; idempotency via app logic |
| `LedgerEntry` | — | — | **WARN** | No unique constraint on `(userId, jobId, type, stripeRef)`; only `id` PK |

**Summary:** Core financial flows (webhook, release, refund, PM release) use transactions and application-level idempotency. **Admin finance adjustments** lack idempotency keys and duplicate ledger entries are possible; **TransferRecord** has no DB-level uniqueness for `(jobId, role)`.

---

## 4. Auth Boundary Integrity

### Is the financial lifecycle fully under `/api/web/*` routes (Clerk-authenticated)?

**NO.** Financial mutations occur in:

- `/api/web/*` — Clerk routes (job-poster, contractor, PM)
- `/api/jobs/*` — **router-approve** (`POST /api/jobs/:id/router-approve`) uses Clerk (requireRouterReady) but is **not** under `/api/web/`
- `/api/job-draft/*` — Payment intent + submit use Clerk (requireJobPoster) but are **not** under `/api/web/`
- `/api/admin/*` — Admin routes (admin_session or Clerk ADMIN)
- `/api/webhooks/stripe` — No user auth; Stripe signature only

### Mixed-auth risks

| Finding | Severity | Details |
|---------|----------|---------|
| Admin routes accept both admin_session and Clerk | **INFO** | By design; both require ADMIN or admin_session. No mixed role. |
| No route accepts both Clerk (non-admin) and admin | **PASS** | Admin routes require ADMIN; web routes require JOB_POSTER/CONTRACTOR/ROUTER. |
| Webhook has no user auth | **EXPECTED** | Stripe signature verification and `stripeWebhookEvents` idempotency. |
| `requireAdmin` vs `requireAdminIdentityWithTier` | **WARN** | `release-funds` uses weaker `requireAdmin`; `release`/`refund` use tier. |

**Auth boundary integrity: CONDITIONAL PASS.** No route allows both Clerk (non-admin) and admin for the same action. The `release-funds` vs `release` auth inconsistency is a policy gap, not a mixed-auth bug.

---

## 5. Launch Risk Score

**Score: 6 / 10**

| Factor | Score | Notes |
|--------|-------|-------|
| Financial surface isolation | 6/10 | Web routes under `/api/web/`; job-draft and router-approve under `/api/jobs/` and `/api/job-draft/` |
| Admin financial control | 5/10 | Admin can trigger release/refund; `release-funds` weaker than `release` |
| Atomicity | 7/10 | Core flows use transactions; adjustments lack idempotency; ledger/TransferRecord no unique constraints |
| Auth boundary | 7/10 | No mixed-auth; admin accepts both session and Clerk; webhook correctly signature-only |

**Risks:**

1. **`release-funds` vs `release`** — Any admin can use `release-funds`; only ADMIN_SUPER can use `release`. Both call `releaseJobFunds`. Consider consolidating or aligning tier.
2. **Ledger adjustments** — No idempotency; duplicate POSTs can create duplicate entries.
3. **TransferRecord** — No unique `(jobId, role)`; idempotency via app logic only; race could theoretically create duplicate legs (mitigated by `FOR UPDATE` and existing transfer checks).

---

## 6. File Path Reference

| Category | Paths |
|----------|-------|
| Auth guards | `apps/api/src/lib/auth/requireAdmin.ts`, `apps/api/src/auth/rbac.ts`, `apps/api/src/auth/onboardingGuards.ts`, `apps/api/app/api/admin/_lib/adminTier.ts` |
| Financial services | `apps/api/src/payouts/releaseJobFunds.ts`, `apps/api/src/services/refundJobFunds.ts`, `apps/api/src/pm/releasePmFunds.ts`, `apps/api/src/pm/finalizePmFunding.ts`, `apps/api/src/payments/finalizeJobFundingFromPaymentIntent.ts` |
| Webhook | `apps/api/app/api/webhooks/stripe/route.ts` |
| Admin financial | `apps/api/app/api/admin/jobs/[id]/release/route.ts`, `refund/route.ts`, `release-funds/route.ts`, `complete/route.ts`, `apps/api/app/api/admin/finance/adjustments/route.ts`, `apps/api/app/api/admin/payout-requests/[id]/mark-paid/route.ts` |
| Web financial | `apps/api/app/api/web/job-poster/jobs/[id]/confirm-completion/route.ts`, `apps/api/app/api/web/contractor/jobs/[id]/complete/route.ts`, `apps/api/app/api/web/job/[jobId]/pm/release-funds/route.ts`, `create-payment-intent/route.ts` |
| Router financial | `apps/api/app/api/jobs/[id]/router-approve/route.ts` |
| Job draft | `apps/api/app/api/job-draft/payment-intent/route.ts`, `apps/api/app/api/job-draft/submit/route.ts` |
