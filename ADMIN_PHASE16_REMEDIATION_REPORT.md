# Phase 16 Remediation Report (apps/admin)

Date: 2026-02-16

## Scope

- Implemented remediation in `apps/admin` only.
- No changes to `apps/api`, `apps/web`, `apps/mobile`, DB schema/migrations, CORS, or auth mechanism design.

## Phase 16.1 Security Hardening

### 16.1.1 Centralized `API_ORIGIN` validation

- Added `apps/admin/src/server/env.ts`:
  - `getValidatedApiOrigin(): string`
  - `validateAdminEnv(): void`
- Validation behavior:
  - Throws when `API_ORIGIN` is missing/empty.
  - Throws when `API_ORIGIN` is not a valid URL (`new URL(...)`).
  - Returns normalized `origin` value.
- Replaced inline origin parsing in:
  - `apps/admin/src/app/api/admin/login/route.ts`
  - `apps/admin/src/app/api/admin/logout/route.ts`
  - `apps/admin/src/app/api/admin/me/route.ts`
  - `apps/admin/src/app/api/admin/signup/route.ts`
  - `apps/admin/src/server/adminApi.ts`
  - `apps/admin/src/app/(admin)/layout.tsx`

### 16.1.2 Proxy guard for `/me` and `/logout` (presence check only)

- Added cookie presence guard in:
  - `apps/admin/src/app/api/admin/me/route.ts`
  - `apps/admin/src/app/api/admin/logout/route.ts`
- Guard checks only for `admin_session` cookie presence.
- Missing cookie response:
  - `401` + `{ "ok": false, "error": "UNAUTHORIZED" }`
- If cookie is present, request is forwarded to upstream unchanged (no role/identity duplication).

### 16.1.3 Signup defense-in-depth

- Updated `apps/admin/src/app/api/admin/signup/route.ts`:
  - Safely parses JSON request body.
  - Rejects missing/empty `adminSecret` with:
    - `400` + `{ "ok": false, "error": "MISSING_ADMIN_SECRET" }`
  - Does not validate secret value in admin proxy.

## Phase 16.2 Boundary Reinforcement

### 16.2.1 Startup env validation hook

- Added startup validation call in:
  - `apps/admin/src/app/(admin)/layout.tsx`
- `validateAdminEnv()` now runs when admin layout module loads, causing early and explicit failure for invalid/missing `API_ORIGIN`.

## Phase 16.3 Cleanup and Consistency

### 16.3.1 Remove dead code

- Removed unused modules:
  - `apps/admin/src/server/adminAuth.ts`
  - `apps/admin/src/server/api/apiClient.ts`

### 16.3.2 Standardize logout error envelope

- Updated `apps/admin/src/app/api/admin/logout/route.ts` error response to consistent envelope:
  - `{ "ok": false, "error": "INTERNAL_ERROR" }`

### 16.3.3 Align fetch pathway

- Kept `adminApiFetch` as the single server-side pathway for admin data access.
- Updated `apps/admin/src/app/(admin)/layout.tsx` to use `adminApiFetch` instead of direct raw fetch.

## Phase 16.4 Observability Enhancements

### 16.4.1 Trace ID propagation

- Added trace propagation in all proxy routes:
  - `login`, `logout`, `me`, `signup`
- Behavior:
  - Reads incoming `x-request-id` or `x-trace-id`.
  - Generates UUID when absent.
  - Forwards `x-request-id` upstream.
  - Includes trace ID in error logs.

### 16.4.2 Structured error logging

- Replaced ad-hoc logs with structured object logs, for example:
  - `console.error("[ADMIN:login:error]", { traceId, message, cause })`
- Applied to all auth proxy routes.

### 16.4.3 Sensitive log guardrails

- Removed client log payload dumps that could include sensitive values.
- Updated auth-related client logs in:
  - `apps/admin/src/app/(auth)/login/LoginClient.tsx`
  - `apps/admin/src/app/(auth)/admin-signup/AdminSignupClient.tsx`
  - `apps/admin/src/components/LogoutButton.tsx`
- No logging of password/adminSecret/cookie/token values.

## Verification Results

### Static checks

- `pnpm --filter @8fold/admin typecheck` passed.
- `pnpm --filter @8fold/admin build` passed.

### Grep checks

- `rg "API_ORIGIN \?\? \"\"" apps/admin` returned no matches.
- `rg "NEXT_PUBLIC_API_URL" apps/admin` returned no matches.

### Manual endpoint checks (no playwright)

- `GET /api/admin/me` without cookie:
  - `401` + `{ "ok": false, "error": "UNAUTHORIZED" }`
- `POST /api/admin/logout` without cookie:
  - `401` + `{ "ok": false, "error": "UNAUTHORIZED" }`
- `POST /api/admin/signup` without `adminSecret`:
  - `400` + `{ "ok": false, "error": "MISSING_ADMIN_SECRET" }`
- Unauthenticated `/admin`:
  - redirects to `/login`.

## Guardrails Enforced

- No DB access added to `apps/admin`.
- No RBAC duplication added in admin routes.
- Proxy guard checks cookie presence only (`admin_session`).
- Identity and role validation remains in `apps/api`.
- No origin fallback patterns retained.
- No hardcoded localhost URLs added in admin source.

## Phase 16 A+ Refinement Addendum

### Upstream 401/403 pass-through hardening

- Added explicit boundary comments in all proxy files:
  - `apps/admin/src/app/api/admin/login/route.ts`
  - `apps/admin/src/app/api/admin/logout/route.ts`
  - `apps/admin/src/app/api/admin/me/route.ts`
  - `apps/admin/src/app/api/admin/signup/route.ts`
- Confirmed upstream response forwarding remains status-preserving:
  - All routes return `new NextResponse(bodyText, { status: upstream.status, ... })`.
- Confirmed no catch branch rewrites upstream 401/403:
  - Upstream 401/403 do not throw and are passed through unchanged.
- Runtime probe with invalid cookie (cookie present, invalid value):
  - `GET /api/admin/me` -> `401` + `{"ok":false,"error":"unauthorized"}`
  - `POST /api/admin/logout` -> `401` + `{"ok":false,"error":"unauthorized"}`

### Startup env validation determinism

- Added explicit fail-fast comment and retained top-level invocation in:
  - `apps/admin/src/app/(admin)/layout.tsx`
- `validateAdminEnv()` is executed at module load, request-independent, with no fallback path.

### Cookie immutability confirmation

- Added explicit comments in proxy routes:
  - "Proxy layer MUST NOT mutate session cookies."
- Confirmed proxy does not generate/clear/regenerate session cookie values.
- `set-cookie` handling only mirrors upstream headers in login/logout; attributes are not rewritten.

### Trace ID propagation hardening

- Kept UUID generation via `randomUUID()` and documented priority:
  - `x-request-id` first, then `x-trace-id`, else new UUID.
- Kept consistent forwarding header: `x-request-id`.
- Kept trace ID in structured server logs only (without sensitive payloads).

### Sensitive logging final sweep

- Re-scanned auth client + proxy files for sensitive logging patterns.
- Confirmed no logs of password/adminSecret/cookie/token/set-cookie/raw bodies.
- Client logs remain structured and non-sensitive.

### Refinement verification rerun

- `pnpm --filter @8fold/admin typecheck` passed.
- `pnpm --filter @8fold/admin build` passed.
- `rg "API_ORIGIN \?\? \"\"" apps/admin` returned no matches.
- `rg "NEXT_PUBLIC_API_URL" apps/admin` returned no matches.

## Frontend Auth Remediation (Follow-up)

### Scope applied

- Updated auth logic in `apps/admin` client auth surfaces only.
- Audited `apps/web` for client-side direct origin/auth bypass patterns; no client-side `API_ORIGIN`/`NEXT_PUBLIC_API_URL` usage was found.

### Client auth centralization

- Added `apps/admin/src/lib/authClient.ts`:
  - `adminAuthFetch(...)` wrapper for `/api/admin/*` client requests.
  - Unified response handling with `{ ok, status, error/data }`.
  - Redirects to `/login` on `401/403` by default.
  - Allows opt-out (`redirectOnAuthError: false`) for login/signup UX.

### Login / signup / logout alignment

- Updated:
  - `apps/admin/src/app/(auth)/login/LoginClient.tsx`
  - `apps/admin/src/app/(auth)/admin-signup/AdminSignupClient.tsx`
  - `apps/admin/src/components/LogoutButton.tsx`
- Before:
  - Each component called `fetch` directly and handled auth/error parsing independently.
- After:
  - All use `adminAuthFetch(...)` for consistent semantics.
  - No direct origin calls.
  - `logout` uses default redirect-on-unauthorized behavior.
  - `login/signup` keep local UX handling by disabling redirect-on-unauthorized.

### Sensitive logging sweep

- Confirmed no console logs include:
  - `password`
  - `adminSecret`
  - `cookie`
  - `token`
  - raw request body
- Client logs remain status/message-only.

### Follow-up verification

- `pnpm --filter @8fold/admin typecheck` passed.
- `pnpm --filter @8fold/admin build` passed.
- `rg "API_ORIGIN \?\? \"\"|NEXT_PUBLIC_API_URL" apps/admin` returned no matches.
