# 8Fold Full Architecture Audit Report

**Mode:** Read-only audit. No fixes applied.  
**Date:** 2026-02-15

---

## Executive Summary

| Area | Health | Notes |
|------|--------|-------|
| **DB Boundary** | ✅ Good | Drizzle/DB confined to apps/api; apps/web has guardrail stub only |
| **API Route Architecture** | ⚠️ Mixed | Most routes proxy correctly; some use raw fetch without apiFetch; one placeholder |
| **Session Flow** | ✅ Good | Cookie `sid` set/read/cleared consistently; cross-port works |
| **Proxy Layer** | ⚠️ Inconsistent | apiFetch used in many routes; raw fetch in others; API_BASE_URL defaults vary |
| **Role Guards** | ⚠️ Split | apps/api enforces RBAC; apps/web has role checks (requireJobPosterAccount) |
| **Dashboard Endpoints** | ⚠️ Partial | Job-poster flows work; support/tickets returns placeholder, not proxy |
| **403/500 Handling** | ✅ Documented | Centralized toHttpError; clear RBAC/onboarding/DB error paths |
| **Dead Code / Legacy** | ⚠️ Minor | Duplicate session utilities; router support proxies to admin (3002) |

**Overall Health Score: 7/10** — Boundary integrity is solid; proxy consistency and a few placeholder routes need attention.

---

## Phase 1 — Boundary Integrity (Web ↔ API ↔ DB)

### 1.1 DB Isolation Rule

| App | Matches | Violation? |
|-----|---------|------------|
| **apps/web** | `apps/web/src/server/db/drizzle.ts` — guardrail stub (throws on use) | ✅ Allowed (intentional guardrail) |
| **apps/api** | Many: `db/drizzle`, `db/schema/*`, `drizzle-orm` | ✅ Allowed (DB authority) |
| **packages/shared** | None | ✅ No DB imports |
| **packages/*** | None | ✅ No DB imports |
| **shared/** | N/A (no top-level shared folder) | — |

**Conclusion:** DB isolation rule is respected. apps/web has no real DB client; only a proxy that throws.

### 1.2 API Route Architecture (apps/web)

| Route | Proxies to apps/api? | Imports DB? | Imports schema? | Imports auth? | Hardcodes localhost? | Label |
|-------|----------------------|------------|-----------------|---------------|---------------------|-------|
| `/api/app/me` | Via requireSession → apiFetch `/api/me` | No | No | requireSession | No (API_BASE_URL) | ✅ Proper proxy |
| `/api/app/job-poster/jobs` | Yes (apiFetch) | No | No | requireJobPosterAccount | No | ✅ Proper proxy |
| `/api/app/job-poster/profile` | Yes (apiFetch) | No | No | requireSession | No | ✅ Proper proxy |
| `/api/app/job-poster/tos` | Yes (apiFetch) | No | No | requireSession | No | ✅ Proper proxy |
| `/api/app/job-poster/materials/pending` | Yes (apiFetch) | No | No | requireSession | No | ✅ Proper proxy |
| `/api/app/job-poster/contractor-responses` | Yes (apiFetch) | No | No | requireSession | No | ✅ Proper proxy |
| `/api/app/job-poster/checkins` | Yes (apiFetch) | No | No | requireSession | No | ✅ Proper proxy |
| `/api/app/support/tickets` | **No** — returns `{ ok: true, data: null }` | No | No | requireSession | No | ❌ Placeholder (does not proxy) |
| `/api/app/support/disputes` | Yes (apiFetch) | No | No | requireSession | No | ✅ Proper proxy |
| `/api/app/router/profile` | Yes (raw fetch to 3003) | No | No | requireSession | base=3003 default | ⚠️ Partial (raw fetch, not apiFetch) |
| `/api/app/router/support/tickets/[id]/status` | Yes (raw fetch) | No | No | requireSession | base=**3002** (admin) | ⚠️ Partial (proxies to admin, not api) |
| `/api/app/router/support/tickets/[id]/messages` | Yes (raw fetch) | No | No | requireSession | base=**3002** (admin) | ⚠️ Partial (proxies to admin) |
| `/api/auth/request` | Yes (raw fetch) | No | No | No | base=3003 default | ⚠️ Partial (no cookie; N/A for login) |
| `/api/auth/request-code` | Yes (raw fetch) | No | No | No | base=3003 default | ⚠️ Partial |
| `/api/auth/verify` | Yes (raw fetch) | No | No | No | base=3003 default | ⚠️ Partial (login flow; no session) |
| `/api/auth/logout` | No — clears cookie only | No | No | No | No | ⚠️ Partial (web-only cookie clear) |
| `/api/bootstrap-admin` | Yes (raw fetch) | No | No | No | base=**3002** (admin) | ⚠️ Partial |
| `/api/jobs/feed` | Via bus → fetchJson to apps/api | No | No | No | getApiBase() | ✅ Proper proxy |
| `/api/public/*` | Via bus → fetchJson | No | No | No | getApiBase() | ✅ Proper proxy |

**Findings:**
- **Support tickets:** `apps/web/src/app/api/app/support/tickets/route.ts` returns `{ ok: true, data: null }` and does **not** proxy to `apps/api` `/api/web/support/tickets`. The UI expects `tickets`; it receives empty. This is a functional gap.
- **Router support:** Proxies to `API_BASE_URL ?? "http://localhost:3002"` (admin app), not apps/api. Intentional if routers use admin for support management.
- **auth/logout:** apps/web clears cookie locally; apps/api logout is separate. Client typically calls web logout.

### 1.3 apps/api is DB Authority

- All DB access occurs in `apps/api`.
- No UI logic, no React imports, no cross-import from apps/web.
- Drizzle and schema imports are confined to apps/api.

---

## Phase 2 — Session & Auth Flow Map

### 2.1 Session Flow Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ LOGIN FLOW                                                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 1. Client → POST /api/auth/request (apps/web)                                    │
│    → apps/web proxies to apps/api /api/auth/request (no cookie)                  │
│    → apps/api sends OTP; returns JSON                                            │
│                                                                                  │
│ 2. Client → POST /api/auth/verify (apps/web)                                    │
│    → apps/web proxies to apps/api /api/auth/verify (body: { token })             │
│    → apps/api: verifyLoginCode() → creates session → returns { sessionToken }     │
│    → apps/web: sets Set-Cookie sid=<token> on response to browser                │
│    → Cookie: httpOnly, path=/, sameSite=lax, secure (prod only)                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│ SESSION VALIDATION                                                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 3. Client → GET /api/app/me (apps/web, port 3006)                                │
│    → Browser sends cookie: sid=<token>                                           │
│    → apps/web: requireSession(req) → getSidFromRequest(req) → sid from cookie     │
│    → loadSessionBySid(sid) → apiFetch("/api/me", sessionToken: sid, request: req)│
│    → apps/api: requireUser(req) → getSessionTokenFromRequest()                    │
│       - Reads: Authorization Bearer, x-session-token, or cookie sid              │
│       - Validates session in DB → returns user                                    │
│    → apps/web returns { ok, role, superuser }                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│ LOGOUT FLOW                                                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 4a. Client → POST /api/auth/logout (apps/web)                                   │
│     → apps/web: sets Set-Cookie sid=; Expires=1970 (clears cookie)               │
│     → Does NOT call apps/api logout                                              │
│                                                                                  │
│ 4b. Client → POST /api/auth/logout (apps/api, if called directly)                │
│     → apps/api: revokeSession(token), clears sid cookie                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Which App Handles What

| Step | App | Reads cookie? | Reads Authorization? | Sets cookie? | Clears cookie? |
|------|-----|---------------|------------------------|--------------|----------------|
| `/api/auth/verify` (login) | apps/web proxies → apps/api | No | No | apps/web sets sid | No |
| `/api/me` | apps/api | Yes (sid) | Yes (Bearer, x-session-token) | No | No |
| `/api/app/me` | apps/web | Yes (via getSidFromRequest) | No (uses cookie → token) | No | No |
| `/api/auth/logout` (web) | apps/web | No | No | No | Yes (sid=; Expires=1970) |
| `/api/auth/logout` (api) | apps/api | Yes | Yes | No | Yes |

### 2.3 Cookie Consistency (sid)

| Location | Action | Options |
|----------|--------|---------|
| `apps/api/app/api/auth/verify/route.ts` | Set | httpOnly, path=/, sameSite=lax, secure (prod), expires |
| `apps/web/src/app/api/auth/verify/route.ts` | Set (via setSessionCookie) | Path=/, HttpOnly, SameSite=Lax, Expires, Secure (prod) |
| `apps/api/app/api/auth/logout/route.ts` | Clear | sid="", path=/, httpOnly, sameSite=lax, secure, expires=0, maxAge=0 |
| `apps/web/src/app/api/auth/logout/route.ts` | Clear | sid=, Path=/, HttpOnly, SameSite=Lax, Expires=1970, Max-Age=0 |
| `apps/api/src/auth/rbac.ts` | Read | getSessionTokenFromRequest() → cookie sid |
| `apps/web/src/server/auth/requireSession.ts` | Read | getSidFromRequest() → cookie sid |
| `apps/web/src/middleware.ts` | Read | req.cookies.get("sid")?.value |

**Options used:** httpOnly ✅, sameSite=lax ✅, secure (prod only) ✅, path=/ ✅, domain: not set (host-only) ✅

---

## Phase 3 — Proxy Integrity

### 3.1 API_BASE_URL / localhost Usage

| Location | Pattern | Notes |
|----------|---------|-------|
| `apps/web/src/server/api/apiClient.ts` | `API_BASE_URL ?? "http://localhost:3003"` | Central; used by apiFetch |
| `apps/web` auth routes | `API_BASE_URL ?? "http://localhost:3003"` | Consistent |
| `apps/web` router profile | `API_BASE_URL ?? "http://localhost:3003"` | Correct |
| `apps/web` router support tickets | `API_BASE_URL ?? "http://localhost:3002"` | **Different** — admin app |
| `apps/web` bootstrap-admin | `API_BASE_URL ?? "http://localhost:3002"` | Admin app |
| `apps/admin` | `API_ORIGIN ?? "http://localhost:3003"` | Points to apps/api |
| `apps/api` payout-methods | `WEB_BASE_URL ?? "http://localhost:3006"` | Redirect URL |
| `apps/api` middleware | `ADMIN_ORIGIN = "http://localhost:3006"` | Hardcoded |
| Scripts | `API_ORIGIN ?? "http://localhost:3003"` | Test/e2e |

**Findings:**
- Router support and bootstrap-admin use port 3002 (admin) by default; other web routes use 3003 (api).
- `API_BASE_URL` in apps/web is overloaded: sometimes 3003, sometimes 3002. Consider `ADMIN_BASE_URL` for admin-facing proxies.

### 3.2 Cookie Forwarding (Web → API)

| Route type | Uses apiFetch? | Forwards cookie? | Forwards method/body? | Preserves status? | Preserves content-type? |
|------------|----------------|-------------------|----------------------|-------------------|--------------------------|
| apiFetch routes | Yes | Yes (via `request: req`) | Yes | Yes (caller handles) | Yes (caller handles) |
| auth/request, request-code, verify | Raw fetch | No (login; no session) | Yes | Yes | Yes |
| router/profile | Raw fetch | No | Yes | Yes | Yes |
| router support tickets | Raw fetch | No | Yes | Yes | Yes |
| bootstrap-admin | Raw fetch | No | Yes | Yes | Yes |

**Note:** Routes using `apiFetch` with `request: req` forward the cookie. Routes using raw fetch with `sessionToken` in Authorization header do not need cookies for the backend call (token is passed explicitly).

### 3.3 Client-Side Fetch (credentials)

- DashboardShell, support/tickets, RoutingWorkspace, job-poster pages, etc. use `credentials: "include"` ✅
- Some support/dispute pages use `fetch(..., { cache: "no-store" })` without explicit `credentials: "include"` — same-origin defaults to include for fetch in most browsers, but explicit is safer.

---

## Phase 4 — RBAC & Role Guards

### 4.1 Role Guard Placement

| Guard | apps/api | apps/web |
|-------|----------|----------|
| `requireAdmin` | ✅ Many admin routes | — |
| `requireAdminOrRouter` | ✅ | — |
| `requireRouter` | ✅ | — |
| `requireJobPoster` | ✅ (via onboardingGuards) | — |
| `requireContractor` | ✅ (via onboardingGuards) | — |
| `requireJobPosterAccount` | — | ✅ (requireJobPosterAccount.ts) |
| `requireSession` | — | ✅ (delegates to apiFetch /api/me) |

**Finding:** apps/web has `requireJobPosterAccount`, which:
1. Calls `requireSession` (validates via apps/api)
2. Checks role JOB_POSTER/ADMIN/SUPER_ADMIN
3. Calls apps/api `/api/web/job-poster-tos` and `/api/web/job-poster/profile` to enforce onboarding
4. Returns 403 if onboarding incomplete

This duplicates onboarding logic that apps/api also enforces. Both layers enforce; no violation, but redundancy.

---

## Phase 5 — Dashboard Endpoint Map (/app/job-poster)

| Endpoint | Web proxy? | API version exists? | API enforces role? | 403? | 500? | DB import correct? |
|----------|------------|---------------------|-------------------|------|------|--------------------|
| `/api/app/job-poster/jobs` | Yes (apiFetch) | `/api/web/job-poster/jobs` | requireJobPosterReady | Yes | Yes (toHttpError) | Yes |
| `/api/app/job-poster/checkins` | Yes | `/api/web/job-poster/checkins` | Yes | Yes | Yes | Yes |
| `/api/app/job-poster/materials/pending` | Yes | `/api/web/job-poster/materials/pending` | Yes | Yes | Yes | Yes |
| `/api/app/job-poster/contractor-responses` | Yes | `/api/web/job-poster/contractor-responses` | Yes | Yes | Yes | Yes |
| `/api/app/support/tickets` | **No** (placeholder) | `/api/web/support/tickets` | Yes | N/A | N/A | N/A |
| `/api/app/support/disputes` | Yes | `/api/web/support/disputes` | Yes | Yes | Yes | Yes |
| `/api/app/me` | Via requireSession | `/api/me` | requireUser | Yes | Yes | Yes |

**Critical:** `/api/app/support/tickets` does not proxy; returns `{ ok: true, data: null }`. UI expects `tickets` array; receives empty.

---

## Phase 6 — 403 / 500 Root Cause Classification

### 6.1 403 Sources (apps/api)

| Category | Location | Reason |
|----------|----------|--------|
| Auth failure | rbac.ts, requireAdmin | No/invalid session, wrong role |
| RBAC failure | rbac.ts | requireRouter, requireJobPoster, requireContractor throw 403 |
| Missing onboarding | onboardingGuards.ts | requireJobPosterReady, requireContractorReady, requireRouterReady → 403 |
| Account state | accountGuard.ts | Archived, suspended |
| Router state | routerJobService, rbac | Router not active, not provisioned |
| Ownership | Various | jobPosterUserId !== u.userId, contractorId mismatch |
| Support | support/tickets, disputes | ADMIN cannot use web support; role mismatch |
| Materials | materials-requests | Contractor waiver, role, approval |

### 6.2 500 Sources (apps/api)

| Category | Location | Reason |
|----------|----------|--------|
| DB error | toHttpError catch-all | Uncaught DB/network errors |
| Null reference | mobileAuth, contractor/appointment | Session/user missing |
| Stripe | stripe webhook | Not configured, internal error |
| Drafts | job-poster/drafts/save | Save failure |
| requireAdmin | requireAdmin.ts | Internal error (verification failure) |

### 6.3 toHttpError Usage

- Centralized in `apps/api/src/http/errors.ts`
- Default: status 500, message "Internal Server Error"
- Preserves `err.status` and `err.message` when present

---

## Phase 7 — Dead Code / Architectural Risks

### 7.1 Duplicate / Redundant Logic

| Item | Locations | Notes |
|------|-----------|-------|
| Session validation | requireSession, requireServerSession, getSidFromRequest | requireServerSession uses requireSessionBySid; acceptable split (route vs server component) |
| Cookie parsing | apps/api rbac, apps/api logout, apps/web requireSession | Same logic in 3 places |
| Logout | apps/web clears cookie only; apps/api revokes + clears | Web logout does not revoke session in DB |
| Onboarding check | requireJobPosterAccount (web) + requireJobPosterReady (api) | Both enforce; redundant but defense-in-depth |

### 7.2 Unused / Placeholder Routes

| Route | Status |
|-------|--------|
| `/api/app/support/tickets` | Placeholder; does not proxy to apps/api |
| `/api/app/[...path]` | Catch-all returns 404 for unknown /api/app paths |

### 7.3 Legacy / Unusual Patterns

- **Router support tickets** proxy to admin (3002), not api (3003). Admin app may proxy to api; flow is router → admin → api.
- **bootstrap-admin** proxies to admin (3002).
- **apps/api** verify route: imports `db` from `@/server/db/drizzle` — but that path in apps/api points to apps/api's db. Confirmed correct.

---

## Top 5 Structural Weaknesses

1. **Support tickets route is a placeholder** — `apps/web/src/app/api/app/support/tickets/route.ts` returns `{ ok: true, data: null }` instead of proxying to `apps/api` `/api/web/support/tickets`. Dashboard support UI will always show "No tickets yet" regardless of real data.

2. **API_BASE_URL overloaded** — Same env var used for apps/api (3003) and apps/admin (3002) in different routes. Router support and bootstrap-admin default to 3002. Risk of misconfiguration in production.

3. **Web logout does not revoke session** — apps/web logout only clears the cookie. Session remains valid in DB until expiry. If token is leaked, it could be used until expiry. apps/api logout revokes; web could proxy to it.

4. **Cookie parsing duplicated** — Same parseCookieHeader/getSid logic in apps/api (rbac, logout) and apps/web (requireSession). Could be shared or centralized.

5. **Raw fetch vs apiFetch inconsistency** — Some routes use apiFetch (cookie forwarding, central base); others use raw fetch with manual headers. Router profile, auth routes, bootstrap-admin, router support all use raw fetch. Harder to audit and maintain.

---

## Appendix: File Reference

- `apps/web/src/server/db/drizzle.ts` — Guardrail stub
- `apps/web/src/server/api/apiClient.ts` — apiFetch, getApiBase
- `apps/web/src/server/auth/requireSession.ts` — getSidFromRequest, requireSession, loadSessionBySid
- `apps/web/src/server/auth/requireServerSession.ts` — Server component session
- `apps/web/src/server/auth/requireJobPosterAccount.ts` — Job-poster role + onboarding
- `apps/api/app/api/auth/verify/route.ts` — Sets sid cookie (when hit directly)
- `apps/api/app/api/auth/logout/route.ts` — Revokes session, clears sid
- `apps/api/src/auth/rbac.ts` — getSessionTokenFromRequest, requireUser, requireRouter, etc.
- `apps/api/src/http/errors.ts` — toHttpError
