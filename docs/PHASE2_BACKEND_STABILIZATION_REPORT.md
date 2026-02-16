# Phase 2 Backend Stabilization Report

**Date:** 2025-02-11  
**Scope:** Response contract rollout, error handling, guard consistency, frontend compatibility

---

## 1. Files Changed

### New Files
- `apps/api/src/lib/api/respond.ts` — Shared response helpers (`ok`, `fail`, `badRequest`, `unauthorized`, `forbidden`)

### Modified Files — API (apps/api)

**Core utilities**
- `apps/api/src/lib/errorHandler.ts` — Uses `fail(500, "internal_error")`; logs full stack + context

**Admin routes (crash/shape fixes)**
- `apps/api/app/api/admin/jobs/[id]/complete/route.ts` — Fixed `requireAdmin` union handling; all responses `ok`/`fail`
- `apps/api/app/api/admin/parts-materials/[id]/release-funds/route.ts` — Wrapped success in `data`; uses `handleApiError`
- `apps/api/app/api/admin/contractors/[id]/route.ts` — Fixed `requireAdmin` union handling (PATCH); `auth.userId`; 400 → `fail`
- `apps/api/app/api/admin/users/[id]/suspend/route.ts` — Fixed typo `admin.adminId` → `auth.userId` in log

**Public routes**
- `apps/api/app/api/public/jobs/recent/route.ts` — `ok({ jobs })`, `badRequest`, `handleApiError`
- `apps/api/app/api/public/jobs/by-location/route.ts` — Same pattern

**Router routes**
- `apps/api/app/api/web/router/routable-jobs/route.ts` — `ok({ jobs })` / `ok({ blocked, missing, jobs })`; `fail(403)`; `handleApiError`
- `apps/api/app/api/web/router/routed-jobs/route.ts` — `ok(payload)`; `fail(403)`; `handleApiError`
- `apps/api/app/api/web/router/earnings/route.ts` — `ok({ projectedPendingCents, totals, ... })`; `handleApiError`
- `apps/api/app/api/web/router/notifications/route.ts` — `ok({ notifications, unreadCount })`; `handleApiError`

**Web/support routes**
- `apps/api/app/api/web/support/disputes/route.ts` — `ok({ disputes })` / `ok({ ticketId, dispute })`; `badRequest`/`fail` for errors; `handleApiError`
- `apps/api/app/api/web/support/disputes/[id]/evidence/route.ts` — `ok({ evidence })`; `fail`/`badRequest`; `handleApiError`
- `apps/api/app/api/web/support/my-jobs/route.ts` — `ok({ jobs })`; `fail(403)`; `handleApiError`

**Job-poster / jobs**
- `apps/api/app/api/web/job-poster/jobs/route.ts` — `ok({ jobs })`; `handleApiError`
- `apps/api/app/api/jobs/feed/route.ts` — `ok({ jobs })`; `handleApiError`

**Auth**
- `apps/api/app/api/rbac/admin-check/route.ts` — Uses non-throwing `requireAdmin` from `@/src/lib/auth/requireAdmin`; returns `ok({ isAdmin: true, userId })`

### Modified Files — Web (apps/web)

**Proxy routes (unwrap `{ ok, data }` for backward compatibility)**
- `apps/web/src/app/api/app/router/routable-jobs/route.ts` — Extracts `payload` from `data` when `ok` + `data` present
- `apps/web/src/app/api/app/router/routed-jobs/route.ts` — Same
- `apps/web/src/app/api/app/router/earnings/route.ts` — Same
- `apps/web/src/app/api/app/job-poster/jobs/route.ts` — Same
- `apps/web/src/app/api/public/jobs/recent/route.ts` — Same
- `apps/web/src/app/api/public/jobs/by-location/route.ts` — Same
- `apps/web/src/app/api/jobs/feed/route.ts` — Same
- `apps/web/src/app/api/app/support/disputes/route.ts` — Unwraps `data` before forwarding (GET + POST)
- `apps/web/src/app/api/app/support/disputes/[disputeId]/evidence/route.ts` — Same (GET + POST)
- `apps/web/src/app/api/app/support/my-jobs/route.ts` — Same
- `apps/web/src/lib/proxyApiJson.ts` — Unwraps `data` when `ok` + `data` present (affects router/contractor/job-poster notifications, conversations, incentives, etc.)

---

## 2. Routes Updated (API response contract)

| Route Family | Routes | New Success Shape | New Error Shape |
|--------------|--------|-------------------|-----------------|
| Public jobs | `/api/public/jobs/recent`, `/api/public/jobs/by-location` | `{ ok: true, data: { jobs } }` | `{ ok: false, error }` |
| Router | `/api/web/router/routable-jobs`, `routed-jobs`, `earnings`, `notifications` | `{ ok: true, data: { ... } }` | `{ ok: false, error }` |
| Support | `/api/web/support/disputes`, `disputes/[id]/evidence`, `my-jobs` | `{ ok: true, data: { ... } }` | `{ ok: false, error }` |
| Job-poster | `/api/web/job-poster/jobs` | `{ ok: true, data: { jobs } }` | `{ ok: false, error }` |
| Jobs feed | `/api/jobs/feed` | `{ ok: true, data: { jobs } }` | `{ ok: false, error }` |
| Admin | `jobs/[id]/complete`, `parts-materials/[id]/release-funds`, `contractors/[id]`, `users/[id]/suspend` | `{ ok: true, data: { ... } }` | `{ ok: false, error }` |
| RBAC | `/api/rbac/admin-check` | `{ ok: true, data: { isAdmin, userId } }` | `{ ok: false, error }` (via requireAdmin) |

---

## 3. Consumers Updated

- **apps/web proxy routes** — All relevant proxies unwrap `{ ok, data }` and forward `data` so existing clients keep receiving `{ jobs }`, `{ disputes }`, `{ notifications }`, etc.
- **apps/admin** — Already uses `apiFetch` which unwraps `data` when `ok` + `data` present (from prior hardening).

---

## 4. Remaining Outliers (raw payloads)

- **Admin routes** — Most admin routes were already standardized in the prior hardening pass. This phase fixed outliers: `complete`, `parts-materials/release-funds`, `contractors/[id]`, `users/[id]/suspend`.
- **Other API routes** — Routes not in the audit list (e.g. `/api/web/contractor/*`, `/api/jobs/[id]/*`, Stripe webhooks, etc.) were not changed. They may still return raw shapes. Future passes can extend the contract to those.

---

## 5. Verification Checklist

- [x] Step 0: Created `respond.ts` with `ok`, `fail`, `badRequest`, `unauthorized`, `forbidden`
- [x] Step 1: `handleApiError` uses `fail(500, "internal_error")`; logs stack + context
- [x] Step 2: Fixed admin `complete` and `parts-materials/release-funds` (guard + shape)
- [x] Step 3: Rolled out response contract to public, router, web/support
- [x] Step 4: `admin-check` uses non-throwing `requireAdmin`
- [x] Step 5: Skipped (masking defaults left as-is for safety)
- [x] Step 6: Frontend proxies unwrap `{ ok, data }` for backward compatibility

**Build:** `pnpm run build` in `apps/api` passes (verified after contractors + users/suspend fixes).

**Manual verification recommended:**
- Run `pnpm dev`; hit `/api/public/jobs/recent`, `/api/web/router/routable-jobs` (with auth), `/api/admin/dashboard` (with admin headers)
- Confirm no 500s, no unhandled promise rejections
- Confirm 401/403 return `{ ok: false, error }`
- Confirm success returns `{ ok: true, data: ... }`
- Admin dashboard should no longer produce unstable 401/500 spam during normal use

---

## 6. Constraints Respected

- No DB schema changes
- No payout math changes
- No endpoint path changes
- No new dependencies
- No refactor of complex query logic into services (scope limited to wrap + standardize)
