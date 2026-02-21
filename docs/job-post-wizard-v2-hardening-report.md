# Job Post Wizard V2 — Hardening Report

## Concurrency Design

**Optimistic Concurrency Control (OCC):**

- All mutation routes require `expectedVersion` in the request body.
- Backend uses `UPDATE ... SET version = version + 1 WHERE id = $draftId AND version = $expectedVersion`.
- If `affected rows === 0`, return `409 VERSION_CONFLICT` with fresh draft copy.
- Frontend replaces local draft, clears pending saves, shows sync banner.

## Idempotency Design

**save-field:**
- Compute `valueHash = sha256(JSON.stringify(value))`.
- If valueHash matches stored hash for that draftId+fieldKey: return success without incrementing version.
- Prevents duplicate writes from blur + debounce double saves.

**create-payment-intent:**
- If `draft.paymentIntentId` exists: retrieve PI from Stripe, return existing clientSecret.
- Do NOT create new Job.
- Do NOT increment version.
- Idempotency key: `draftV2:{draftId}:pi`.

**verify-payment:**
- Calls shared `finalizeJobFundingFromPaymentIntent`.
- If finalizer returns `idempotent = true`, still return success.
- Set draft CONFIRMED only if not already.

## Stripe PI Safety

- No duplicate PaymentIntents: idempotency key `draftV2:{draftId}:pi`.
- No duplicate Jobs: Job created only when `draft.paymentIntentId` is null.
- Return URL: `/app/job-poster/payment/return-v2`.
- Webhook + verify share finalization via existing `finalizeJobFundingFromPaymentIntent`.

## Multi-Tab Safety

- Frontend tracks `draft.version`, passes `expectedVersion` with every mutation.
- On `VERSION_CONFLICT`: replace local draft, clear pending saves, show banner.
- No optimistic UI false checkmarks; only server-confirmed status.

## Canonical Field Keys

- `packages/shared/src/jobDraftV2.fieldKeys.ts` defines strict union.
- Backend rejects unknown keys with `400 INVALID_FIELD_KEY`.

## Jurisdiction Enforcement

- On `details.geo` save: if value has countryCode/stateCode, compare to draft locked values.
- Mismatch: `409 JURISDICTION_MISMATCH` with expected/got.

## Test Coverage

- Backend: `apps/api/src/__tests__/jobDraftV2/save-field.test.ts` (field key validation).
- Frontend: `apps/web/e2e/job-wizard-v2/placeholder.spec.ts` (placeholder).
- Full test suite to be expanded per plan.
