# Full Auth + Drizzle Audit Report

**Date:** 2026-02-15  
**Context:** POST /api/auth/verify previously 500; "Send verification code" button does nothing.

---

## STEP 1 — Drizzle Instance Integrity

### `drizzle(` calls

| File | Purpose |
|------|---------|
| `apps/api/db/drizzle.ts` | **Canonical** db instance (exports `db`) |
| `apps/api/src/testUtils/testDb.ts` | Test-only `createTestDb()` — isolated, not used in routes |
| `docs/DRIZZLE_SCHEMA_SNAPSHOT_2026_02_12.md` | Documentation only |

### `new Pool(` calls

| File | Purpose |
|------|---------|
| `apps/api/db/drizzle.ts` | Single production pool |
| `apps/api/src/testUtils/testDb.ts` | Test pool (separate) |

### db imports

- **apps/api:** All routes import `db` from `../../../../db/drizzle` or `../../db/drizzle` (canonical).
- **apps/web:** **ZERO** db or drizzle imports ✅
- **apps/admin:** Imports `db` from `@api/db/drizzle` (path alias → `../api/db/drizzle`). Admin loads the **same** db module; no duplicate `drizzle()` in admin.

### Conclusion

- **One** production db instance: `apps/api/db/drizzle.ts`
- **No** db imports in apps/web ✅
- **No** duplicate drizzle initialization in auth routes
- **Minor:** `apps/admin` has `drizzle-orm` in package.json (violates DEPENDENCY_GUARDRAILS.md) but does not create its own instance; it imports from api.

---

## STEP 2 — Auth Route Runtime

### Auth route files

| Route | Location | `runtime = "edge"` | Imports db from |
|-------|----------|--------------------|-----------------|
| `POST /api/auth/request` | `apps/api/app/api/auth/request/route.ts` | **No** | N/A (uses `requestLoginCode` → mobileAuth → db) |
| `POST /api/auth/verify` | `apps/api/app/api/auth/verify/route.ts` | **No** | `../../../../db/drizzle` ✅ |
| `POST /api/auth/request` (proxy) | `apps/web/src/app/api/auth/request/route.ts` | **No** | N/A (proxies to API) |
| `POST /api/auth/verify` (proxy) | `apps/web/src/app/api/auth/verify/route.ts` | **No** | N/A (proxies to API) |

### Grep result

```
runtime = "edge"  → 0 matches in repo
```

**Conclusion:** All auth routes use **Node runtime** (default). No Edge runtime. ✅

---

## STEP 3 — Controlled Logging (Added)

| Route | Logs added |
|-------|------------|
| `apps/api/.../auth/request/route.ts` | `AUTH HIT [request]`, `BODY:`, ... |
| `apps/api/.../auth/verify/route.ts` | `AUTH HIT [verify]`, `BODY:`, `DB INSTANCE: typeof db` |

**How to verify:** Restart API dev server, trigger auth flow, check API terminal for these logs.

---

## STEP 4 — Frontend Button Wiring

### Signup (`SignupClient.tsx`)

- **Button:** `onClick={() => void requestCode()}` ✅
- **Fetch:** `fetch("/api/auth/request", { method: "POST", body: JSON.stringify({ email }) })` ✅
- **URL:** `/api/auth/request` → resolves to `apps/web` route (same-origin) ✅
- **Early return:** None before fetch ✅
- **Disabled:** `disabled={loading || !roleValid}` ⚠️ **If role is not selected, button is disabled.** `roleValid` requires `role === "router" | "job-poster" | "contractor"`. User must select a role before "Send verification code" is clickable.

### Login (`LoginClient.tsx`)

- **Button:** `onClick={() => void requestCode()}` ✅
- **Fetch:** `fetch("/api/auth/request", ...)` ✅
- **Disabled:** `disabled={loading}` only — no role requirement ✅

### Logging added

- `console.log("Sending verification request")` in both `requestCode()` handlers (signup + login).

---

## STEP 5 — Dependency Tree

### drizzle-orm

```
@8fold/admin   → drizzle-orm 0.45.1
@8fold/api     → drizzle-orm 0.45.1
@8fold/web     → (none) ✅
```

- **apps/web:** Zero drizzle dependency ✅
- **apps/api:** Single consumer for auth/DB
- **apps/admin:** Has drizzle (violates guardrails) but imports db from api, does not create own instance

### pg

```
8fold-local (root) → pg 8.18.0
@8fold/admin       → pg 8.18.0
@8fold/api         → pg 8.18.0
@8fold/web         → (none) ✅
```

---

## STEP 6 — Final Diagnosis

### Drizzle duplication status

- **No** duplicate production db instances.
- **One** canonical: `apps/api/db/drizzle.ts`.
- Test utils create isolated instance; admin imports from api.

### Auth route runtime status

- **All Node runtime.** No Edge. ✅

### Whether routes are being hit

- **To confirm:** Restart API dev, trigger auth, look for `AUTH HIT [request]` and `AUTH HIT [verify]` in API terminal.
- If logs appear → routes are hit; issue is downstream (DB, validation, proxy).
- If logs never appear → request not reaching API (proxy config, CORS, wrong port, or web route failing before proxy).

### Whether frontend click handler fires

- **To confirm:** Open browser console, click "Send verification code" / "Send code". Look for `Sending verification request`.
- If log appears → handler fires; issue is fetch/response.
- If log never appears → button disabled (e.g. signup without role) or click not bound.

### Dependency tree summary

- apps/web: no drizzle, no pg ✅
- apps/api: drizzle + pg ✅
- apps/admin: drizzle + pg, imports db from api

### Likely root cause

1. **"Send verification code" does nothing (signup):**  
   **Most likely:** Button is **disabled** because `roleValid` is false — user has not selected a role. The button has `disabled={loading || !roleValid}`. Fix: Select Router / Job Poster / Contractor before clicking.

2. **POST /api/auth/verify 500:**  
   **Previously:** Next.js dev `MODULE_NOT_FOUND` for vendor chunks (corrupted `.next`). **Fix:** `rm -rf apps/api/.next` and restart API dev.

3. **If API routes are not hit:**  
   - Check the web app origin + `.env.local` configuration.
   - Ensure API dev is on 3003.
   - Ensure web proxy routes (`apps/web/src/app/api/auth/*`) are correct.

4. **Edge runtime / pg:** Ruled out — no Edge runtime in auth routes.

5. **apps/web importing api DB:** Ruled out — no db/drizzle imports in web.

---

## Recommendations

1. **Immediate:** On signup, if "Send verification code" appears unresponsive, ensure a role is selected.
2. **If 500 persists:** Clear `apps/api/.next` and restart API dev.
3. **Optional:** Add a subtle UI hint when role is empty: e.g. "Select a role to continue" or disable styling that makes it obvious the button is disabled.
4. **Optional:** Revisit apps/admin having drizzle-orm (guardrails violation) in a dedicated cleanup.
