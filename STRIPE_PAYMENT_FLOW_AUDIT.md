# Stripe Payment Flow Audit

## 1) Current Architecture Overview

- PaymentIntent is created server-side from `apps/api/app/api/web/job-poster/jobs/[id]/create-payment-intent/route.ts`.
- Stripe confirmation happens client-side with Stripe Elements (`stripe.confirmPayment`) and a `return_url`.
- Return page at `apps/web/src/app/app/job-poster/payment/return/page.tsx` calls server verification before showing success.
- Server verification is handled by the canonical wizard payment verification route.
- Webhook processing is handled by `apps/api/app/api/webhooks/stripe/route.ts`, and `/api/stripe/webhook` now forwards to that same handler.

## 2) Threat Model

- Spoofed return URL query params.
- Duplicate verification calls (double-clicks/reloads/retries).
- Amount tampering between DB expectations and Stripe object.
- Currency mismatch between job config and Stripe PaymentIntent.

## 3) Mitigations Implemented

- Query parameters are not trusted for payment success.
- Return page only treats payment as successful after API verification returns success.
- Verification route retrieves PaymentIntent from Stripe using server credentials.
- Single platform Stripe account mode is enforced (all retrievals use the platform secret without Connect-account override).
- Connect rollout guardrail:
  - Contractor/Router Stripe Connect Express onboarding is payout-only.
  - Job funding PaymentIntents must remain on the platform account.
  - Do not retrieve escrow PaymentIntents with a connected-account context.
- Verification route enforces:
  - `payment_intent.status === succeeded`
  - metadata `jobId` exists and maps to DB job
  - metadata `userId` matches authenticated user
  - Stripe amount equals expected job amount using `amount_received` (fallback to `amount` only when `amount_received` is unavailable, with structured warning log)
  - Stripe currency equals expected job currency
- Webhook finalization enforces metadata `jobPosterUserId` matches the job poster in DB (no authenticated-user requirement in webhook context).
- Any mismatch returns deterministic failure and support escalation response.

## 4) Idempotency Safeguards

- Verification checks if job is already funded before writing.
- On already-funded jobs, route returns success with `idempotent: true` and writes nothing.
- Structured idempotent-hit logging is emitted.
- Job payment writes are status-guarded to prevent duplicate captures.
- Single job-to-payment mapping is enforced:
  - if a job already has `stripePaymentIntentId` and a different PI arrives, funding finalization fails.
  - if `JobPayment` already references a different PI, funding finalization fails.

## 5) Shared Finalization Logic

- Web verify route and Stripe webhook now both call a shared function:
  - `finalizeJobFundingFromPaymentIntent(pi, context)`
  - file: `apps/api/src/payments/finalizeJobFundingFromPaymentIntent.ts`
- This removes drift risk between webhook and verify-path funding behavior.

## 6) Metadata Integrity Enforcement

- PaymentIntent creation includes:
  - `jobId`
  - `jobPosterUserId`
  - `userId`
  - `environment`
- Verification cross-checks metadata `jobId` and `userId` with authenticated DB context before marking funded.
- AI appraisal metadata persistence remains enforced separately (`appraisalTraceId`, `appraisalModel`, `appraisedAt`).

## 7) Webhook Backup Layer

- Canonical webhook endpoint: `/api/webhooks/stripe`.
- Compatibility endpoint `/api/stripe/webhook` forwards to canonical handler.
- Webhook signature verification remains required before event processing.
- `payment_intent.succeeded` is handled server-side and can finalize funding as a backup path.

## 8) Test Matrix (Required)

- Normal success card flow:
  - verify return page calls server verification and funds job once.
- 3DS/redirect-required success flow:
  - redirect occurs, return page loads, server verification finalizes exactly once.
- Decline/failure flow:
  - job is not funded, support escalation path remains available.
- Replay attack simulation:
  - capture a valid succeeded `payment_intent` id
  - call verify endpoint again with the same id
  - verify response returns `idempotent: true`
  - verify no second ledger/audit funding write and no duplicate funding transition

## 9) Final Security State Confirmation

- Query params are not trusted.
- Payment is verified server-side with Stripe retrieval.
- Duplicate processing is prevented via idempotent checks.
- Currency and amount are validated against server expectations.
- Single job-to-payment mapping is enforced.
- No payment can mark a job funded without Stripe-confirmed success and server verification checks.
