# Admin Routing + Proxy Audit Report

**Date:** 2026-02-13  
**Scope:** Determine why `/api/admin/*` requests from the Admin UI (port 3002) return 404 instead of being proxied to `apps/api`.  
**Method:** Facts only — no code changes, no speculation.

---

## 1. Port Configuration

| App | Dev Port | Source |
|-----|----------|--------|
| Admin UI | **3002** | `apps/admin/package.json` → `"dev": "next dev -p 3002"` |
| API | **3003** | `apps/api/package.json` → `"dev": "next dev -p 3003"` |

---

## 2. Proxy Route Exists

**YES**

- **File:** `apps/admin/app/api/admin/[...path]/route.ts`
- **Behavior:** Catch-all route delegates to `proxyAdminApi()` from `apps/admin/src/server/adminApiProxy.ts`
- **Methods:** GET, POST, PUT, PATCH, DELETE

---

## 3. Proxy Implementation

From `apps/admin/src/server/adminApiProxy.ts`:

| Item | Value |
|------|-------|
| API origin source | `process.env.API_ORIGIN ?? "http://localhost:3003"` |
| Default fallback | `http://localhost:3003` |
| Fetch target pattern | `\`${base}${upstreamPath}${url.search}\`` |
| Path forwarding | Preserves `/api/admin/*` (e.g. `/api/admin/stats` → `http://localhost:3003/api/admin/stats`) |

---

## 4. Admin Environment Config

| File | Exists | API origin |
|------|--------|---------------|
| `apps/admin/.env` | No | — |
| `apps/admin/.env.development` | No | — |
| `apps/admin/.env.local` | Yes | `http://localhost:3003` |

**API origin defined:** YES  
**API origin value:** `http://localhost:3003`  
**Matches expected API port:** YES (3003)

`apps/admin/next.config.ts` does not load env; Next.js loads `.env.local` by default.

---

## 5. Backend Admin Routes

### Implemented in `apps/api/app/api/admin/`

- `/api/admin/stats`
- `/api/admin/jobs`
- `/api/admin/contractors`
- `/api/admin/job-drafts`
- `/api/admin/payout-requests`
- `/api/admin/support/tickets`
- `/api/admin/support/disputes`
- `/api/admin/routing-activity`
- `/api/admin/audit-logs`
- `/api/admin/users`
- `/api/admin/notifications/send`
- `/api/admin/monitoring/*`
- `/api/admin/ai/diagnostics/test-nano`
- (49 route files total)

### Missing (Admin UI calls, no backend route)

| Path | Admin UI Caller |
|------|-----------------|
| `/api/admin/dashboard` | `apps/admin/app/page.tsx` (home page) |
| `/api/admin/support/inbox` | `apps/admin/app/support/page.tsx` |
| `/api/admin/settings/mock-refresh` | `apps/admin/app/settings/page.tsx` |
| `/api/admin/ai-email-campaigns/*` | Multiple pages |
| `/api/admin/ai-agent-pipeline/*` | Multiple pages |
| `/api/admin/job-appraisals/pending` | `apps/admin/app/jobs/status/page.tsx` |
| `/api/admin/jobs/status` | `apps/admin/app/jobs/status/page.tsx` |
| `/api/admin/jobs/bulk-delete-mocks` | `apps/admin/app/jobs/page.tsx` |
| `/api/admin/bulk-ai-jobs/*` | `apps/admin/app/jobs/page.tsx` |
| `/api/admin/materials` | `apps/admin/app/materials/page.tsx` |
| `/api/admin/my/roles` | `apps/admin/app/my/roles/page.tsx` |
| `/api/admin/jobs/[id]/holds` | `apps/admin/app/jobs/[id]/page.tsx` |
| `/api/admin/jobs/[id]/ai-appraisal` | `apps/admin/app/jobs/[id]/page.tsx` |
| `/api/admin/jobs/[id]/apply-ai-price` | `apps/admin/app/jobs/[id]/page.tsx` |

---

## 6. Manual Backend Test

**Not executed** (audit-only, no terminal).

To verify with API running on port 3003:

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}" "http://localhost:3003/api/admin/stats"
```

---

## 7. Root Cause Classification

**D) Backend missing route**

- Proxy route exists and forwards to `http://localhost:3003`.
- API origin is set to `http://localhost:3003`.
- Admin home page calls `apiFetch("/api/admin/dashboard")` on load.
- `/api/admin/dashboard` is not implemented in `apps/api`.
- Backend returns 404 for that request.

The 404 originates from the backend (`apps/api`), not from the Admin app or the proxy. The proxy is functioning; the requested route is missing in `apps/api`.

---

## Summary

| # | Finding |
|---|---------|
| 1 | Admin dev port: **3002** |
| 2 | API dev port: **3003** |
| 3 | Proxy route exists: **YES** |
| 4 | API origin defined: **YES** |
| 5 | API origin value: **`http://localhost:3003`** |
| 6 | Backend admin routes: **Partial** — many implemented, several missing |
| 7 | Manual backend test: **Not run** |
| 8 | Root cause: **D) Backend missing route** |
