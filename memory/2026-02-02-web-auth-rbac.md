# 8Fold Local — Web Auth + Role Isolation (Option A)

**Date:** 2026-02-02  
**Task:** Implement web-only authentication + role-based dashboards (Option A)  
**Status:** ✅ COMPLETE (Web-only, backend/admin unchanged)

---

## Constraints (Option A)

- **No backend API changes for auth**: web uses existing API endpoints:
  - `POST /api/auth/request` (email → sends one-time code)
  - `POST /api/auth/verify` (code → returns session token)
- **No admin changes**: `apps/admin` remains separate and unchanged.
- **Terminology**: web UI uses **“Job Poster”** everywhere (no “Customer” UI strings).
- **Session storage**: web stores the API session token in an **httpOnly cookie**.
- **Role lock**: web locks the selected role at signup using a **signed role cookie** (server-verified).

---

## What was built

### 1) Web auth proxy routes (httpOnly cookies)

Added web routes that proxy to the existing API auth endpoints and set cookies server-side:

- `apps/web/src/app/api/auth/request/route.ts`
  - Proxies to API `POST /api/auth/request`
- `apps/web/src/app/api/auth/verify/route.ts`
  - Proxies to API `POST /api/auth/verify`
  - Sets `eightfold_session` (httpOnly) from returned `sessionToken`
  - If signup provided a role, sets `eightfold_role` (httpOnly) as a signed token
- `apps/web/src/app/api/auth/logout/route.ts`
  - Clears `eightfold_session` + `eightfold_role`

Cookies:
- `eightfold_session`: API session token, httpOnly, `sameSite=lax`, expires at API session expiry
- `eightfold_role`: signed role token, httpOnly, `sameSite=lax`, expires at API session expiry

### 2) Unified signup (role selector) + login

New pages:
- `apps/web/src/app/signup/page.tsx`
  - Email + required role selector: **Router / Job Poster / Contractor**
  - Requests one-time code
  - Verifies code + **locks role** by passing role to `/api/auth/verify`
- `apps/web/src/app/login/page.tsx`
  - Email → one-time code → session cookie set

Support pages:
- `apps/web/src/app/forbidden/page.tsx`
- `apps/web/src/app/app/page.tsx` (redirects to correct role dashboard)

### 3) Server-side role guards (middleware)

Added:
- `apps/web/src/middleware.ts`

Behavior:
- Guards **all `/app/*` routes**
- Requires `eightfold_session` and a valid signed `eightfold_role`
- Enforces strict path-role match:
  - `/app/router/*` only for role `router`
  - `/app/contractor/*` only for role `contractor`
  - `/app/job-poster/*` only for role `job-poster`
- Redirects to `/login?next=…` if missing/invalid cookies
- Redirects to `/forbidden` if role mismatch

### 4) Signed role token (role lock)

Added:
- `apps/web/src/lib/roleToken.ts`

Implements:
- HMAC-SHA256 signing via WebCrypto (`ROLE_COOKIE_SECRET`)
- Token format: `payloadB64url.signatureB64url`
- Payload includes role + lockedAt timestamp

### 5) Role dashboards (UI shell only)

Scaffolded placeholder dashboards + navigation only:

- Router:
  - `/app/router`
  - `/app/router/jobs`
  - `/app/router/earnings`
  - `/app/router/profile`
- Contractor:
  - `/app/contractor`
  - `/app/contractor/jobs`
  - `/app/contractor/profile`
- Job Poster:
  - `/app/job-poster`
  - `/app/job-poster/jobs`
  - `/app/job-poster/profile`

Shared shell:
- `apps/web/src/components/DashboardShell.tsx`

---

## Tightened role isolation for future data fetching (web-only)

We added a **web-owned “data access layer”** under:

- `GET /api/app/*`

Rules:
- Role dashboards must fetch **only** from `/api/app/{role}/*` routes.
- These routes enforce role isolation server-side using the signed `eightfold_role` cookie.
- This prevents accidental leakage even if a client page attempts to call router endpoints directly.

Implemented routes:

- `GET /api/app/me`
  - Returns `{ authenticated, role }` based purely on web cookies (no identity exposure).

- Router-only proxy (allowed role: `router`)
  - `GET /api/app/router/active-job` → proxies API `GET /api/jobs/active` with `Authorization: <sessionToken>`

- Job Poster-only placeholder (allowed role: `job-poster`)
  - `GET /api/app/job-poster/jobs` → `{ jobs: [] }` (backend does not yet support authenticated job posters in v1)

- Contractor-only placeholder (allowed role: `contractor`)
  - `GET /api/app/contractor/jobs` → `{ jobs: [] }` (backend authenticates routers; contractors are token-gated in v1)

Implementation helpers:
- `apps/web/src/lib/requireWebRole.ts`
- `apps/web/src/lib/proxyApiJson.ts`

### 6) Role-specific profile schemas (web-only, placeholders)

Implemented as `zod` schemas (no persistence yet):
- Router profile schema: name, email, address (private), state/province (locked), payout method (PayPal/Stripe/Wise)
- Contractor profile schema: business name, phone, address (private), trade, years experience, service radius
- Job Poster profile schema: name, email, phone, city, state/province

Files:
- `apps/web/src/app/app/router/profile/page.tsx`
- `apps/web/src/app/app/contractor/profile/page.tsx`
- `apps/web/src/app/app/job-poster/profile/page.tsx`

---

## Jobs feed CTA behavior

Updated `/jobs` to determine “router vs guest” server-side (httpOnly cookies):
- `apps/web/src/app/jobs/page.tsx` (server component)
- `apps/web/src/app/jobs/JobsClient.tsx` (client component)

If authenticated **router**:
- Job cards show CTA: **“Claim & Route This Job”**

If guest / non-router:
- Job cards show CTA: **“Sign up to route this job”**

---

## Env updates

Web:
- `apps/web/.env.local`
  - `API_ORIGIN=http://localhost:3002`
  - `ROLE_COOKIE_SECRET=dev-only-change-me`

---

## Files added/modified (high level)

### Added
- `apps/web/src/middleware.ts`
- `apps/web/src/lib/webAuthCookies.ts`
- `apps/web/src/lib/roleToken.ts`
- `apps/web/src/app/api/auth/{request,verify,logout}/route.ts`
- `apps/web/src/app/{login,signup,forbidden}/page.tsx`
- `apps/web/src/app/app/page.tsx`
- `apps/web/src/components/{AuthShell,DashboardShell}.tsx`
- Role dashboards + placeholder pages under `apps/web/src/app/app/*`
- `apps/web/src/app/jobs/JobsClient.tsx`

### Modified
- `apps/web/src/app/jobs/page.tsx` (server-side role-aware wrapper)
- `apps/web/src/components/JobCard.tsx` (terminology: “Job Poster Pays”)
- `apps/web/package.json` (added `zod`)

---

## Non-goals confirmed (not implemented)

- No payments
- No messaging logic
- No mobile changes
- No admin changes
- No DB schema changes for this task

