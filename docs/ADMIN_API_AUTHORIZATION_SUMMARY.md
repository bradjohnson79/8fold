# Admin API Authorization — Summary

How the 8Fold admin API authorization system is built and how it works.

---

## Overview

Admin API routes (`/api/admin/*`) in `apps/api` use a layered authorization model:

1. **Middleware** — Edge gate for `/api/admin/*` (except public paths)
2. **Route guards** — Per-route auth via `requireAdmin`, `requireAdminOrRouter`, or `requireAdminIdentityWithTier`
3. **Two identity sources** — Admin session cookie (primary) and Clerk JWT (fallback)
4. **Server-to-server** — Internal header auth for scripts and non-browser clients

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  apps/admin (UI)                                                        │
│  - Login form → POST /api/admin/login (apps/api)                        │
│  - Sets admin_session cookie on success                                 │
│  - adminApiFetch() forwards cookie to apps/api on every request          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  apps/api middleware (Edge)                                              │
│  - Matcher: /api/admin/*                                                │
│  - Public paths: /login, /logout, /signup → pass through                 │
│  - If admin_session cookie present → pass (route verifies)               │
│  - Else: x-internal-secret + x-admin-id + x-admin-role=ADMIN → pass     │
│  - Else: 401                                                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Route handler (Node.js)                                                 │
│  - requireAdmin(req) or requireAdminIdentityWithTier(req)                 │
│  - 1) admin_session cookie → getAdminIdentityBySessionToken() → DB      │
│  - 2) Fallback: Clerk Bearer token → requireAuth → requireRole(ADMIN)    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Middleware (Edge Gate)

**File:** `apps/api/middleware.ts`

- **Scope:** Only `/api/admin/*` paths
- **Public paths:** `/api/admin/login`, `/api/admin/logout`, `/api/admin/signup` — no auth required
- **Cookie path:** If `admin_session` cookie exists → pass through (route does DB verification)
- **Internal header path:** For server-to-server (scripts, cron):
  - `x-internal-secret` must match `INTERNAL_SECRET`
  - `x-admin-id` must be a valid UUID
  - `x-admin-role` must be `ADMIN`
- **CORS:** `ADMIN_ORIGIN` used for `Access-Control-Allow-Origin`

Middleware runs in the Edge runtime and does not query the DB. It only checks for presence of cookie or valid internal headers.

---

## 2. Identity Sources

### A. Admin Session Cookie (Primary)

**Used by:** `apps/admin` UI

**Flow:**
1. User submits email/password to `POST /api/admin/login`
2. API validates against `admin_users` (bcrypt password hash)
3. On success: creates row in `admin_sessions`, returns `admin_session` cookie (HttpOnly, SameSite=Lax)
4. Cookie contains a 64-char hex session token; DB stores SHA-256 hash
5. Subsequent requests: `admin_session` cookie sent automatically (same-origin) or forwarded by `adminApiFetch` (cross-origin)

**Files:**
- `apps/api/src/lib/auth/adminSession.ts` — token handling, `getAdminIdentityBySessionToken()`
- `apps/api/app/api/admin/login/route.ts` — login handler
- `apps/admin/src/server/adminApi.ts` — forwards cookie to API

**Tables:**
- `admin_users` — id, email, passwordHash, role
- `admin_sessions` — id, adminUserId, sessionTokenHash, expiresAt

### B. Clerk JWT (Fallback)

**Used by:** Mobile/API clients with Bearer token

**Flow:**
1. Client sends `Authorization: Bearer <clerk_jwt>`
2. `requireAuth()` verifies JWT via Clerk (`verifyToken`)
3. Resolves internal user from `users` table (Clerk userId → internal id)
4. `requireRole(req, "ADMIN")` checks `users.role === "ADMIN"` and `users.status` not ARCHIVED/SUSPENDED

**Files:**
- `apps/api/src/auth/requireAuth.ts` — Clerk JWT verification
- `apps/api/src/auth/requireRole.ts` — role + status check

---

## 3. Route Guards

### requireAdmin

**File:** `apps/api/src/lib/auth/requireAdmin.ts`

- Tries admin session cookie first
- Falls back to Clerk + `requireRole("ADMIN")`
- Returns `{ userId, role: "ADMIN" }` or `NextResponse` (401/403/500)

### requireAdminOrRouter

- Same as above, but also allows `ROUTER` role
- Used for routes like job assignment where routers can act

### requireAdminOrSeniorRouter

- Admin or Senior Router (DB: `routers.isSeniorRouter`)
- Used for support/dispute routes

### requireAdminIdentityWithTier

**File:** `apps/api/app/api/admin/_lib/adminTier.ts`

- Returns `{ userId, email, tier, authSource }`
- **Tiers:** `ADMIN_VIEWER` | `ADMIN_OPERATOR` | `ADMIN_SUPER`
- Tier derived from email allowlists:
  - `ADMIN_SUPER_EMAILS` (env, comma-separated)
  - `ADMIN_VIEWER_EMAILS` (env)
  - Default: `ADMIN_OPERATOR`
- `enforceTier(identity, required)` — returns 403 if tier insufficient
- Used for finance/sensitive routes (e.g. release funds, refund) that require `ADMIN_SUPER`

---

## 4. Admin Account Creation

### Signup (Controlled)

**Endpoint:** `POST /api/admin/signup`

**Body:** `{ email, password, adminSecret }`

- `adminSecret` must match `ADMIN_SIGNUP_SECRET`
- Inserts into `admin_users` with bcrypt-hashed password, role `ADMIN`
- No session created; user must then login

---

## 5. Internal Header Auth (Server-to-Server)

For scripts, cron jobs, or services that call the API without a browser:

```
x-internal-secret: <INTERNAL_SECRET>
x-admin-id: <admin user UUID>
x-admin-role: ADMIN
```

- Middleware validates before route runs
- Route handlers may still call `requireAdmin`; for internal calls the cookie path won’t match, but Clerk path is not used — internal header path is handled at middleware level, so request proceeds
- **Note:** Middleware passes internal-header requests through; route handlers typically use `requireAdmin` which will fail without cookie or Clerk. Some routes may use `requireInternalAdmin` for header-only auth.

**File:** `apps/api/src/server/requireInternalAdmin.ts` — validates headers, returns `{ adminId }` or `false`

**Note:** Most admin routes use `requireAdmin`, which expects cookie or Clerk. Internal headers satisfy the middleware gate but do not satisfy `requireAdmin` by themselves. For server-to-server flows, use `POST /api/admin/login` with `x-admin-proxy: true` to receive `sessionToken` in the response, then send `cookie: admin_session=<token>` on subsequent requests.

---

## 6. Key Env Vars

| Variable | Purpose |
|----------|---------|
| `ADMIN_ORIGIN` | CORS origin for admin UI |
| `INTERNAL_SECRET` | Server-to-server auth |
| `ADMIN_SIGNUP_SECRET` | Required for admin signup |
| `ADMIN_SUPER_EMAILS` | Comma-separated emails for SUPER tier |
| `ADMIN_VIEWER_EMAILS` | Comma-separated emails for VIEWER tier |
| `CLERK_*` | Clerk JWT verification (fallback path) |

---

## 7. Security Properties

- **Session tokens:** 32-byte random hex, stored as SHA-256 hash in DB
- **Passwords:** bcrypt (cost 10)
- **Cookie:** HttpOnly, SameSite=Lax, Secure in production
- **No stack traces** to clients; errors return `{ ok: false, error }`
- **Tier enforcement** limits sensitive actions (e.g. finance) to SUPER admins
