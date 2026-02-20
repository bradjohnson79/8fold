# Clerk Session Loop Audit Report

**Date:** 2025-02-17  
**Symptoms:** Clerk login succeeds, no 400/422 errors, user auto-logs in at `/login`, `/app` shows "Session still loading", no console errors.

---

## Root Cause

**"Session still loading"** is rendered when `requireServerSession()` returns `null`. That happens when `loadServerMeSession()` catches an error with `status === 401`. Two paths can produce that 401:

| Path | Location | Condition |
|------|----------|-----------|
| **A** | `apps/web/src/server/auth/meSession.ts` | `requireApiToken()` throws (getToken timeout, pending, or missing) |
| **B** | `apps/api` → `requireAuth` | Token verification fails (issuer mismatch, invalid token, etc.) |

**Most likely production cause:** `CLERK_ISSUER` mismatch. The API enforces `iss` against `CLERK_ISSUER`. If you use a custom Clerk domain (e.g. `clerk.8fold.app`), the JWT `iss` will be `https://clerk.8fold.app` (or similar). If `CLERK_ISSUER` in `apps/api` is still set to `https://<instance>.clerk.accounts.dev`, verification fails → 401 → `loadServerMeSession` returns `null` → `TokenPendingClient` → "Session still loading".

**Secondary cause:** `requireApiToken()` timeout. Production `maxWaitMs` is 1200ms. Right after sign-in redirect, Clerk's `getToken()` can be slow; if it doesn't return in time, we throw `AUTH_TOKEN_TIMEOUT` → 401.

---

## Exact Logic Flow

1. User visits `/app` → middleware allows (Clerk signed in).
2. `apps/web/src/app/app/page.tsx` runs:
   - `auth()` returns `clerkUserId` ✓
   - `requireServerSession()` → `loadServerMeSession()` → `requireMeSession()`
3. `requireMeSession()`:
   - Calls `requireApiToken()` → `getToken()` with retries (prod max 1200ms)
   - If token obtained: `apiFetch` to `${API_ORIGIN}/api/me` with Bearer token
   - If `requireApiToken()` throws or API returns 401: error propagates
4. `loadServerMeSession` catches, and when `status === 401` returns `null`.
5. Page renders `<TokenPendingClient nextFallback="/app" />`.
6. `TokenPendingClient` runs a bounded refresh loop (~2.5s), then sets `exhausted=true` → **"Session still loading"**.

---

## Responsible Files

| File | Role |
|------|------|
| `apps/web/src/server/auth/meSession.ts` | `requireApiToken`, `loadServerMeSession`; 401 → null |
| `apps/web/src/app/app/page.tsx` | Renders `TokenPendingClient` when `!session` |
| `apps/web/src/app/app/TokenPendingClient.tsx` | "Session still loading" UI |
| `apps/api/src/auth/requireAuth.ts` | Token verification, `CLERK_ISSUER` check |
| `apps/api/app/api/me/route.ts` | Calls `requireAuth`; returns 401 on failure |

---

## Code Changes Required

### 1. Add diagnostic logging (optional)

When `loadServerMeSession` returns `null`, log the reason so you can confirm whether it's token timeout or API 401.

### 2. Increase production token wait

Bump `maxWaitMs` from 1200 to 2000 to reduce false timeouts after redirect.

### 3. TokenPendingClient: full reload on Refresh

Use `window.location.reload()` instead of `router.refresh()` for the Refresh button. A full reload can succeed when the token is ready on a fresh request.

### 4. Document CLERK_ISSUER

Clarify in `apps/api/.env.example` that `CLERK_ISSUER` must match the JWT `iss` exactly (including custom domain).

---

## Verification

1. Set `WEB_AUTH_DEBUG_LOG=true` in `apps/web` and reproduce. Check logs for `auth.session_null` to see the exact error code.
2. Confirm `CLERK_ISSUER` in `apps/api` matches the issuer in your Clerk JWTs (e.g. from Clerk Dashboard → JWT Templates, or decode a token).
3. Ensure `CLERK_JWT_KEY` or `CLERK_SECRET_KEY` in `apps/api` matches the same Clerk instance as `apps/web`.
