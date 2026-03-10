# Stripe Environment Audit Report
**Date:** 2026-03-09  
**Auditor:** Automated audit (Cursor AI Agent)  
**Scope:** `apps/api`, `apps/web`, `apps/admin` — local `.env.local` files + source code

---

## Phase 1 — Environment Variable Audit

### apps/api `.env.local`

| Variable | Status | Value (prefix) | Verdict |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | ✅ Present | `sk_live_...` | LIVE ✅ |
| `STRIPE_PUBLISHABLE_KEY` | ✅ Present | `pk_live_...` | LIVE ✅ |
| `STRIPE_WEBHOOK_SECRET` | ✅ Present | `whsec_...` | ✅ |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | ✅ Present | `whsec_...` | ✅ |
| `STRIPE_MODE` | ❌ **Missing** | — | **ADDED → `live`** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ⚠️ Not set | — | Not required in API env; API reads `STRIPE_PUBLISHABLE_KEY` |
| Comment accuracy | ❌ | Said "test mode" | **Fixed → "LIVE mode"** |

**Actions taken:**
- Added `STRIPE_MODE=live` to `apps/api/.env.local`
- Fixed misleading comment from `# Stripe (test mode)` to `# Stripe (LIVE mode)`
- Fixed label for restricted key from "Restricted Test Key" to "Restricted Live Key"

---

### apps/web `.env.local`

| Variable | Before | After | Verdict |
|---|---|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` ❌ | `pk_live_...` ✅ | **Fixed** |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_...` ❌ | **Removed** ✅ | Not a web variable |
| `STRIPE_SECRET_KEY` | `sk_test_...` ❌ | **Removed** ✅ | Server-side secret — must NOT exist in web app |
| `STRIPE_WEBHOOK_SECRET` | Present ❌ | **Removed** ✅ | Webhook secret belongs in API only |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `whsec_...` ❌ | **Removed** ✅ | Belongs in API only |
| `STRIPE_MODE` | Missing ❌ | `live` ✅ | **Added** |
| Comment | "Stripe (test mode)" ❌ | "Stripe (LIVE mode)" ✅ | **Fixed** |

**Issues found:**
1. **CRITICAL — sk/pk mode mismatch:** API was `sk_live_` while web was `pk_test_`. Any Stripe.js checkout session would fail: the browser payment method would be created in test mode but confirmed against a live payment intent.
2. **SECURITY — Server secret in web env:** `STRIPE_SECRET_KEY=sk_test_...` existed in `apps/web/.env.local`. Even if test-mode, secret keys must never be in the web app environment. Removed.
3. **SECURITY — Webhook secrets in web env:** `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET` existed in the web env. These are API-only. Removed.

---

### apps/admin `.env.local`

| Variable | Status | Verdict |
|---|---|---|
| `STRIPE_SECRET_KEY` | Not present | ✅ Correct — admin uses internal API proxy |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Not present | ✅ Correct — admin has no Stripe.js UI |
| `STRIPE_WEBHOOK_SECRET` | Not present | ✅ Correct |

No issues found in the admin environment. Admin communicates with the API through the internal proxy, never touching Stripe directly.

---

## Phase 2 — Stripe Initialization Code Audit

### API — `apps/api/src/stripe/stripe.ts`

```typescript
stripeClient = new Stripe(stripeSecretKey, { /* SDK default API version */ });
```

- Reads `STRIPE_SECRET_KEY` ✅
- Calls `assertStripeKeysMatchMode()` on first use ✅
- Guards against live keys in non-production (`isNonProdLiveKey`) ✅
- Lazy singleton pattern — no module-level Stripe instantiation ✅

### API — `apps/api/src/services/stripeGateway/stripeClient.ts`

```typescript
stripeClient = new Stripe(requireStripeSecret(), {
  apiVersion: "2025-02-24.acacia",
  maxNetworkRetries: 2,
  timeout: 10_000,
});
```

- Reads `STRIPE_SECRET_KEY` ✅
- Pinned API version (`2025-02-24.acacia`) for reconciliation gateway ✅

### API — `apps/api/src/stripe/integrity/stripeIntegrityClient.ts`

```typescript
const baseStripeIntegrityClient = new Stripe(requireStripeIntegrityReadKey(), {
  apiVersion: STRIPE_API_VERSION,
});
```

- Reads `STRIPE_INTEGRITY_READ_KEY` (restricted live key `rk_live_...`) ✅
- Read-only proxy guard blocks `.create()`, `.update()`, `.delete()` ✅

### API — `apps/api/app/api/webhooks/stripe/route.ts`

```typescript
return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
```

- Isolated webhook-only client, reads `STRIPE_SECRET_KEY` ✅
- Intentionally separated from main client to avoid mode assertion interference ✅

### Web — All `loadStripe()` calls

Files confirmed correct:
- `apps/web/src/app/post-job/page.tsx`
- `apps/web/src/app/app/job-poster/(app)/post-a-job-v3/steps/StepPayment.tsx`
- `apps/web/src/app/app/job-poster/(app)/jobs/[jobId]/materials/page.tsx`
- `apps/web/src/app/job-adjustment/[adjustmentId]/payment/page.tsx`
- `apps/web/src/app/job-adjustment/[adjustmentId]/page.tsx`

All use:
```typescript
const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
loadStripe(pk)
```
✅ No hardcoded keys found anywhere in source.

### Hardcoded Key Scan

| Pattern | Found in production code | Verdict |
|---|---|---|
| `sk_test_` literal | Test files only | ✅ |
| `pk_test_` literal | Test files only | ✅ |
| `STRIPE_TEST_KEY` | Script utilities only | ✅ |
| Hardcoded `whsec_` | None | ✅ |

---

## Phase 3 — Security Guard Verification

### Existing Guards

| Guard | Location | Status |
|---|---|---|
| `sk_live + STRIPE_MODE=test` → throw STRIPE_MODE_MISMATCH | `mode.ts:assertStripeKeysMatchMode` | ✅ Implemented |
| `sk_test + STRIPE_MODE=live` → throw STRIPE_MODE_MISMATCH | `mode.ts:assertStripeKeysMatchMode` | ✅ Implemented |
| `sk_live + pk_test` → throw STRIPE_MODE_MISMATCH | `runtimeConfig.ts:getStripeRuntimeConfig` | ✅ Implemented |
| Live key in non-production → throw STRIPE_NONPROD_LIVE_KEY | `stripe.ts:isNonProdLiveKey` | ✅ Implemented |
| Missing key in production → throw | `stripe.ts:getStripeClient` | ✅ Implemented |
| Web pk/sk mismatch → 409 response | `stripe/config/route.ts` | ✅ Implemented |

### New Guard Added — `verifyStripeEnvironment()`

Created: `apps/api/src/stripe/verifyStripeEnvironment.ts`

Call during API boot:
```typescript
import { verifyStripeEnvironment } from "@/src/stripe/verifyStripeEnvironment";
verifyStripeEnvironment(); // throws on misconfiguration in production
```

This function consolidates all checks into a single callable, suitable for placement in `instrumentation.ts`, a startup script, or the first middleware layer.

---

## Summary of Fixes Applied

| Fix | File | Severity |
|---|---|---|
| Added `STRIPE_MODE=live` | `apps/api/.env.local` | HIGH |
| Fixed misleading `# Stripe (test mode)` comment | `apps/api/.env.local` | LOW |
| Fixed "Restricted Test Key" label for live key | `apps/api/.env.local` | LOW |
| Updated `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` from `pk_test_` to `pk_live_` | `apps/web/.env.local` | CRITICAL |
| Removed `STRIPE_SECRET_KEY` (server secret from web env) | `apps/web/.env.local` | HIGH (security) |
| Removed `STRIPE_PUBLISHABLE_KEY` (redundant, wrong key) | `apps/web/.env.local` | HIGH |
| Removed `STRIPE_WEBHOOK_SECRET` from web env | `apps/web/.env.local` | HIGH (security) |
| Added `STRIPE_MODE=live` | `apps/web/.env.local` | HIGH |
| Created `verifyStripeEnvironment()` startup validator | `apps/api/src/stripe/verifyStripeEnvironment.ts` | NEW |

---

## Vercel Production Environment Checklist

Ensure these are set in the **Vercel dashboard** (not `.env.local`) for each deployment:

**apps/api (Vercel project):**
- [ ] `STRIPE_SECRET_KEY=sk_live_...`
- [ ] `STRIPE_PUBLISHABLE_KEY=pk_live_...`
- [ ] `STRIPE_WEBHOOK_SECRET=whsec_...` (from Stripe Dashboard → Webhooks → signing secret)
- [ ] `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...` (Connect webhook endpoint secret)
- [ ] `STRIPE_MODE=live`
- [ ] `STRIPE_EXECUTION_SECRET_KEY=sk_live_...`
- [ ] `STRIPE_INTEGRITY_READ_KEY=rk_live_...`

**apps/web (Vercel project):**
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...`
- [ ] `STRIPE_MODE=live`

**apps/admin (Vercel project):**
- No Stripe keys needed ✅
