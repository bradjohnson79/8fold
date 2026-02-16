# Backend Dashboard Infrastructure Audit

**Date:** 2026-02-16  
**Target:** apps/admin (8Fold Backend Dashboard)  
**Scope:** Read-only static audit. No code modifications.

---

## 1️⃣ Executive Summary

| Aspect | Assessment |
|--------|-------------|
| **Overall health** | **Moderate** |
| **Major boundary violations** | None. Admin is DB-free; all data access via apps/api proxy. |
| **Major architectural drift** | Minor: `requireAdminIdentity` and `apiClient` appear unused. |
| **Security posture** | Adequate. Cookie-based admin session; API_ORIGIN required. Env fallback (`?? ""`) on API_ORIGIN allows empty string at runtime before guard. |

**Critical security exposure:** NO

---

## 2️⃣ Route Inventory

| Page | API Used | Guard | Notes |
|------|----------|-------|-------|
| `/` (Overview) | `/api/admin/dashboard`, `/api/admin/jobs/status`, `/api/admin/users/contractors`, `/api/admin/support/tickets`, `/api/admin/support/disputes`, `/api/admin/stripe/revenue`, `/api/admin/jobs/visual-integrity` | Layout `fetch(api/admin/me)` → redirect to /login if 401 | Server-side `adminApiFetch`; requires admin_session cookie |
| `/admin` | — | Same | |
| `/contractors` | — | Same | |
| `/disputes` | — | Same | |
| `/jobs` | `/api/admin/jobs` | Same | |
| `/jobs/[id]` | `/api/admin/jobs/[id]`, archive, refund, complete, route, escalate-dispute | Same | |
| `/jobs/image-audit` | `/api/admin/jobs/image-audit`, assign | Same | |
| `/jobs/title-audit` | `/api/admin/jobs/title-audit`, rewrite | Same | |
| `/jobs/description-audit` | `/api/admin/jobs/scope-audit/rewrite`, description-audit | Same | |
| `/payouts` | `/api/admin/payout-requests`, `/api/admin/finance/payout-history`, `/api/admin/finance/stripe-reconciliation`, mark-paid, adjustments | Same | |
| `/routers` | — | Same | |
| `/settings` | — | Same | |
| `/support` | — | Same | |
| `/users` | `/api/admin/users` | Same | |
| `/users/[id]` | `/api/admin/users/[id]`, suspend, unsuspend, archive, restore, notes | Same | |
| `/metrics` | — | Same | |
| `/login` | `/api/admin/login` (client fetch) | None (public) | Auth page |
| `/admin-signup` | `/api/admin/signup` (client fetch) | None (public) | Requires adminSecret in body |

---

## 3️⃣ API Surface Inventory

**Admin app API routes (proxy to apps/api):**

| Route | Method | Guard | DB Access | Risk Level |
|-------|--------|-------|-----------|------------|
| `/api/admin/login` | POST | None | Via apps/api | Low (auth) |
| `/api/admin/logout` | POST | None (relies on cookie) | Via apps/api | Low |
| `/api/admin/signup` | POST | None | Via apps/api | Medium (public; requires adminSecret) |
| `/api/admin/me` | GET | None (cookie forwarded) | Via apps/api | Low |

**Note:** Admin app does not implement `requireAdmin` on its own routes. Protection is:
1. Layout calls `fetch(api/admin/me)` server-side; redirects to `/login` if 401.
2. `adminApiFetch` throws if no admin_session cookie; pages using it fail if unauthenticated.
3. `/api/admin/login`, `/api/admin/signup` are intentionally public.

---

## 4️⃣ Auth & RBAC Analysis

- **Admin routes protected?** Yes, indirectly. `(admin)/layout.tsx` validates session via `GET /api/admin/me`; 401 → redirect to `/login`.
- **Client-only guard?** No. Session check is server-side in layout.
- **Missing requireAdmin?** Admin app does not use `requireAdmin` (that lives in apps/api). Admin relies on cookie + layout redirect.
- **Signup/login:** Public by design; signup requires `adminSecret` in request body (validated by apps/api).

---

## 5️⃣ Data Layer Boundary

| Check | Result |
|-------|--------|
| **Prisma usage** | None in apps/admin. None in apps (grep `new PrismaClient`, `prisma.`). |
| **Drizzle direct DB access** | None in apps/admin. Admin is DB-free. |
| **Proxy violations** | None. All admin data flows through `adminApiFetch` → apps/api. |

---

## 6️⃣ Legacy Role Drift

| Pattern | Location | Risk |
|---------|----------|------|
| `"USER"` \| `"CUSTOMER"` \| `"SUPER_ADMIN"` | `apps/api/scripts/backfillUnifiedUsers.ts` only | Low. Script, not admin UI. |
| Admin UI | No legacy role enums found in apps/admin. | None. |

---

## 7️⃣ Error Handling Consistency

| Aspect | Finding |
|--------|---------|
| **Standard envelope** | Admin API routes return `NextResponse.json({ ok: false, error: "..." })` on error. Upstream (apps/api) response passed through for login/logout/me/signup. |
| **Inconsistent shapes** | Logout error: `{ error: "internal_error" }` (no `ok`). Others use `{ ok: false, error: "..." }`. |
| **Missing try/catch** | All 4 admin API routes have try/catch. |

---

## 8️⃣ Env + Origin Risks

| Env | Required | Validation | Fallback |
|-----|----------|------------|----------|
| `API_ORIGIN` | Yes | Checked per-request: `if (!apiOrigin) return 500` | `process.env.API_ORIGIN ?? ""` — empty string if unset, then guarded |
| `ADMIN_ID` | Referenced in `adminAuth.ts` | `env("ADMIN_ID")` throws if missing | None (but `requireAdminIdentity` is unused) |
| `INTERNAL_SECRET` | Referenced in `adminAuth.ts` | `env("INTERNAL_SECRET")` throws if missing | None (but `requireAdminIdentity` is unused) |

**Hardcoded origins:** None. Port 3002 only in `package.json` scripts (dev/start).

---

## 9️⃣ Logging & Observability

| Location | Pattern | Notes |
|----------|---------|-------|
| `logout/route.ts` | `console.error("[ADMIN_LOGOUT_ERROR]", err)` | Error path only |
| `signup/route.ts` | `console.error("[ADMIN_SIGNUP_ERROR]", err)` | Error path only |
| `login/route.ts` | `console.error("[ADMIN_PASSWORD_LOGIN_ERROR]", err)` | Error path only |
| `AdminSignupClient.tsx` | `console.error("[ADMIN_SIGNUP_FAILED]", ...)` | Client-side |
| `LoginClient.tsx` | `console.error("[ADMIN_PASSWORD_LOGIN_FAILED]", ...)` | Client-side |
| `LogoutButton.tsx` | `console.error("[ADMIN_LOGOUT_FAILED]", e)` | Client-side |

- **Gated logging?** No. Plain `console.error`.
- **Sensitive data logged?** Client logs include `{ status, json }` — may contain error messages from API.
- **Missing logs?** No critical routes without error logging.

---

## 🔟 High-Risk Findings

| Severity | File | Impact |
|----------|------|--------|
| **Critical** | — | None identified |
| **High** | — | None identified |
| **Medium** | `apps/admin/src/app/api/admin/signup/route.ts` | Public endpoint; relies entirely on apps/api to validate `adminSecret`. If apps/api misconfigures, signup could be open. |
| **Medium** | `apps/admin/src/app/api/admin/*` | `API_ORIGIN ?? ""` allows empty string until explicit check. Slight window for misconfiguration. |
| **Low** | `apps/admin/src/app/api/admin/logout/route.ts` | Error response `{ error: "internal_error" }` lacks `ok: false` for consistency. |
| **Low** | `apps/admin/src/server/adminAuth.ts` | `requireAdminIdentity` exported but never used. Dead code. |
| **Low** | `apps/admin/src/server/api/apiClient.ts` | `apiFetch`, `getApiOrigin` exported but never imported. Dead code. |

---

## 1️⃣1️⃣ Likely Bugs (Static Inference)

| Pattern | Location | Notes |
|---------|----------|-------|
| **Dead imports** | `adminAuth.ts`, `apiClient.ts` | Exported but unused. |
| **Inconsistent error shape** | `logout/route.ts` | Returns `{ error: "internal_error" }` vs `{ ok: false, error: "..." }` elsewhere. |
| **Endpoint mismatch** | — | None observed. |
| **Missing await** | — | None observed. |
| **Typo'd route** | — | None observed. |

---

## 1️⃣2️⃣ Unknowns (Requires Runtime Verification)

- Whether `ADMIN_SIGNUP_SECRET` (or equivalent) is correctly enforced by apps/api for signup.
- Whether admin_session cookie is HttpOnly, Secure, SameSite in production.
- Whether API_ORIGIN is ever empty in deployed environments.

---

## Grep Playbook Summary

| Command | Result |
|---------|--------|
| `rg --files apps/admin/app` | No `app` dir; structure is `apps/admin/src/app` |
| `rg "export async function (GET|POST|...)"` | 4 route handlers: login, logout, signup, me |
| `rg "fetch\("` | 10 matches: proxy routes + layout + client components |
| `rg "apiFetch"` | 1 match: apiClient (unused) |
| `rg "ADMIN_ORIGIN|API_ORIGIN|WEB_ORIGIN"` | API_ORIGIN only; no hardcoded localhost in source |
| `rg "new PrismaClient\|prisma\."` | No matches in apps |
| `rg "drizzle\|db\."` | No matches in apps/admin |
| `rg "USER\|CUSTOMER\|SUPER_ADMIN"` | 1 match in backfill script only |
| `rg "requireAdmin\|optionalUser"` | In apps/api, apps/web; not in admin (admin uses layout + cookie) |
| `rg "console\.(log|error|warn)"` | 7 matches, all error paths |
| `rg "process\.env"` | 6 files, API_ORIGIN + adminAuth (ADMIN_ID, INTERNAL_SECRET) |
| `rg "eval\|dangerouslySetInnerHTML\|req\.query"` | No matches |

---

## Typecheck & Build

| Target | Result |
|--------|--------|
| `pnpm --filter @8fold/admin build` | ✓ Pass |
| `pnpm --filter @8fold/admin typecheck` | ✓ Pass |
| `pnpm -r typecheck` | Fails in apps/mobile (Clerk), apps/api (pre-existing); admin passes |

---

## Completion Summary

| Metric | Value |
|--------|-------|
| **Total admin routes (pages)** | 18 |
| **Total admin API routes** | 4 |
| **Total issues categorized** | 7 (0 critical, 0 high, 2 medium, 5 low) |
| **Critical security exposure** | **NO** |
