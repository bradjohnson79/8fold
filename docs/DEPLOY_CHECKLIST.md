# Production Deploy Checklist

**Phase 5 — Production Readiness**  
**Do not deploy automatically.** Complete all items before deploying.

---

## 1. Environment — No 8fold_test in Production

### 1.1 Production DATABASE_URL

- [ ] **Production** `DATABASE_URL` must NOT include `?schema=8fold_test`
- [ ] Use `?schema=public` or omit schema (defaults to `public`)
- [ ] `schemaLock` enforces `schema=public` at runtime when `NODE_ENV=production`

### 1.2 Current State

| Location | Status |
|----------|--------|
| `apps/api/.env.local` | No schema param — OK |
| `apps/web/.env.local` | No schema param — OK |
| `apps/admin/.env.local` | No schema param — OK |
| Root `.env` | Has `schema=8fold_test` — **local dev only**; never used by production deploy |

---

## 2. Runtime Code — 8fold_test Hardcoding (BLOCKERS)

**4 runtime files** hardcode `"8fold_test"` in raw SQL. These will fail in production (tables live in `public`).

| File | Tables | Action |
|------|--------|--------|
| `apps/api/app/api/admin/finance/transfers/[transferId]/reconcile/route.ts` | `TransferRecord` | Replace with `getResolvedSchema()` or Drizzle |
| `apps/api/src/payments/materialsPayments.ts` | `MaterialsPayment`, `MaterialsRequest` | Replace with `getResolvedSchema()` or Drizzle |
| `apps/api/app/api/admin/support/disputes/route.ts` | `support_attachments`, `dispute_votes` | Replace with `getResolvedSchema()` or Drizzle |
| `apps/api/src/support/disputeSlaMonitor.ts` | `dispute_alerts` | Replace with `getResolvedSchema()` or Drizzle |

- [ ] Fix all 4 files to use schema-agnostic queries before deploy

---

## 3. Production DB Schema Match

### 3.1 Verify Production Schema

- [ ] Run: `DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api verify:prod-schema`
  - Requires `DATABASE_URL` pointing at production DB
  - Confirms `public."User"` has required columns
- [ ] Run: `DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api verify-financial-schema`
  - Confirms financial tables (Escrow, LedgerEntry, etc.) match expectations

### 3.2 Local vs Production

- [ ] Confirm migrations applied to production match local `drizzle/` migrations
- [ ] Jobs table: `jobs` (snake_case columns), not `Job`
- [ ] Job draft table: `JobDraft` (camelCase columns: userId, createdAt, updatedAt)

---

## 4. Build

- [ ] `pnpm run build` — **PASS** (verified)
- [ ] `pnpm -C apps/api typecheck` — **PASS** (verified)
- [ ] `pnpm -C apps/web typecheck` — **PASS** (verified)

---

## 5. Pre-Deploy Verification Commands

```bash
# Full typecheck
pnpm -C apps/api typecheck
pnpm -C apps/web typecheck
pnpm -C apps/admin typecheck

# Build
pnpm run build

# Production schema verification (DATABASE_URL = prod)
DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api verify:prod-schema
DOTENV_CONFIG_PATH=.env.local pnpm -C apps/api verify-financial-schema

# Lifecycle tests (API running on 3003)
BASE_URL=http://localhost:3003 pnpm -C apps/api test:lifecycle
BASE_URL=http://localhost:3003 pnpm -C apps/api test:lifecycle:financial  # requires STRIPE_WEBHOOK_SECRET
```

---

## 6. Post-Deploy Smoke (see RELEASE_SMOKE_CHECK.md)

- [ ] `GET https://api.8fold.app/api/public/jobs/recent?limit=9` returns 200
- [ ] Homepage loads; "Newest jobs" section works
- [ ] Auth flows (login, signup, onboarding)
- [ ] Admin router tools and support routes

---

## 7. Summary

| Check | Status |
|-------|--------|
| No 8fold_test in prod env | ⚠️ Verify platform env vars |
| No 8fold_test in runtime code | ❌ 4 files need fix |
| Prod schema matches local | ⬜ Run verify scripts |
| Build passes | ✅ Pass |
| Deploy | ⬜ Manual — after blockers resolved |
