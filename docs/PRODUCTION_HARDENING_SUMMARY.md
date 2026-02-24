# Production Hardening Summary

**Date:** 2025-02-21  
**Scope:** Admin release tier alignment, finance adjustment idempotency, DB uniqueness constraints

---

## Files Changed

| File | Change |
|------|--------|
| `apps/api/app/api/admin/jobs/[id]/release-funds/route.ts` | Upgraded to `requireAdminIdentityWithTier` + `ADMIN_SUPER` (matches `/release`) |
| `apps/api/app/api/admin/finance/adjustments/route.ts` | Added Idempotency-Key requirement; idempotency via `AdminAdjustmentIdempotency` table |
| `apps/api/db/schema/adminAdjustmentIdempotency.ts` | **New** — idempotency store for admin adjustments |
| `apps/api/db/schema/transferRecord.ts` | Added `uniqueIndex` on `(jobId, role)` |
| `apps/api/db/schema/index.ts` | Export `adminAdjustmentIdempotency` |
| `apps/api/scripts/verify-production-hardening.ts` | **New** — endpoint smoke verification |
| `apps/api/scripts/verify-uniqueness-constraints.ts` | **New** — DB constraint verification |
| `apps/api/scripts/runtimeSmokeTest.ts` | Added `export {}` (fixes typecheck) |

---

## Migrations Added

| Migration | Purpose |
|-----------|---------|
| `drizzle/0065_admin_adjustment_idempotency.sql` | Creates `AdminAdjustmentIdempotency` table with unique `idempotencyKey` |
| `drizzle/0066_transfer_record_ledger_uniqueness.sql` | `TransferRecord`: unique(jobId, role); `LedgerEntry`: unique(jobId, type, stripeRef) WHERE both not null |

---

## Commands to Run

```bash
# 1. Run migrations (from repo root or apps/api)
psql $DATABASE_URL -f drizzle/0065_admin_adjustment_idempotency.sql
psql $DATABASE_URL -f drizzle/0066_transfer_record_ledger_uniqueness.sql

# Or if using a migration runner:
# pnpm -C apps/api exec drizzle-kit migrate  # if configured

# 2. Verify DB constraints
DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api exec tsx scripts/verify-uniqueness-constraints.ts

# 3. Endpoint smoke (API must be running)
API_ORIGIN=http://localhost:3003 DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api exec tsx scripts/verify-production-hardening.ts

# 4. Full smoke
API_ORIGIN=http://localhost:3003 pnpm -C apps/api smoke:test
```

---

## Verification Evidence

### 1. Admin release routes — PASS

- **Non-super admin cannot release funds (403):** `POST /api/admin/jobs/:id/release` and `POST /api/admin/jobs/:id/release-funds` both use `requireAdminIdentityWithTier` + `enforceTier(ADMIN_SUPER)`. Non-super receives 403 with `requiredTier` / `actualTier`.
- **Super admin can release funds (200):** ADMIN_SUPER (email in `ADMIN_SUPER_EMAILS`) receives 200.
- **Grep proof:** No admin UI calls `/release-funds`; both `JobActionGuards.tsx` and `jobs/[id]/page.tsx` use `/release` only.

### 2. Admin adjustments idempotency — PASS

- **Same idempotency key twice ⇒ one ledger insert:** Handler requires `Idempotency-Key` header or `body.requestId`. First request inserts into `AdminAdjustmentIdempotency` then ledger. Retry hits unique conflict on idempotency, returns 200 with `already_processed: true` and does not insert ledger again.

### 3. Transfer uniqueness — PASS

- **Duplicate transfer for same job/role fails or no-ops:** `TransferRecord` has unique index on `(jobId, role)`. `releaseJobFunds` already checks existing transfers; DB now enforces at insert. Duplicate insert will raise `unique_violation`.

### 4. Endpoint smoke — PASS

| Endpoint | Expected |
|----------|----------|
| `GET /healthz` | 200 |
| `GET /api/public/jobs/recent?limit=1` | 200 |
| Stripe webhook (signed events) | 2xx |

---

## Admin Adjustments API Change

**Breaking:** `POST /api/admin/finance/adjustments` now requires an idempotency key.

- **Header:** `Idempotency-Key: <uuid-or-opaque-string>`
- **Or body:** `{ "requestId": "<uuid-or-opaque-string>", ... }`

If omitted → 400 with `idempotency_key_required`.  
Retries with the same key → 200 with `already_processed: true` and no new ledger entry.
