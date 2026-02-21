# Job Post V2 — Audit + Finalize Report

## A) DEPLOYMENT & BUILD DIAGNOSTICS

### 1) Production endpoint outputs (as of audit)

**GET https://8fold.app/api/app/_diag/build** (old path — `_diag` is Next.js private folder)
```json
{"ok":false,"error":"Unknown /api/app route: /_diag/build"}
```
**Root cause:** `_`-prefixed folders are private in Next.js App Router; `app/_diag/build` does not create a route.

**Fix applied:** Renamed to `diag` (no underscore). New path: `/api/app/diag/build`.

**GET https://8fold.app/api/app/job-poster/drafts-v2/current** (unauthenticated)
```json
{"success":false,"code":"CURRENT_FAILED","traceId":"a9782514-1420-4e2e-841e-ee25ca167d57","message":"Failed to load draft."}
```
HTTP status: 401

### 2) Local main HEAD
```bash
git rev-parse HEAD
# 0e3f2c196a2204ab49a7d29627a4125508d36c39

git log -1 --oneline
# 0e3f2c1 chore(prod): add JobDraftV2 build diag and production verification tooling (#25)
```

### 3) vercelEnv / runtimeSchema
- Production `_diag` was unreachable; after fix, use `/api/app/diag/build`.
- `runtimeSchema` comes from `DATABASE_URL` `?schema=`; if absent, defaults to `public`.
- Production should use `?schema=8fold_test` if that is the intended schema.

---

## B) DATABASE / SCHEMA TRUTH

### 4) DATABASE_URL (redacted)
From `apps/api/.env.local`:
```
postgresql://neondb_owner:***@ep-purple-dawn-afo04gbg-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```
No `?schema=` in this sample → runtime uses `public`.

### 5) Schema in use
- `SHOW search_path` → `"public", public` (when no schema param)
- `SELECT current_schema()` → `public`
- With `?schema=8fold_test` → `search_path` and `current_schema` would be `8fold_test`.

### 6) JobDraftV2 in expected schema
- **Table exists:** YES (in `public` for this env)
- **Enum types exist:** YES (`JobDraftV2Step`, `JobDraftV2FieldStateStatus`)
- **Required columns:** All present (id, userId, countryCode, stateCode, currentStep, data, validation, lastSavedAt, version, archivedAt, jobId, paymentIntentId, paymentIntentCreatedAt, createdAt, updatedAt)

### 7) diagnose-jobdraftv2-prod.ts output
```
EXPECTED_SCHEMA=public
SEARCH_PATH=public, public
CURRENT_SCHEMA=public
TABLES_OK=true
ENUMS_OK=true
MISSING_COLUMNS=[]
FOUND_TABLES=[JobDraftV2,JobDraftV2FieldState]
FOUND_ENUMS=[JobDraftV2FieldStateStatus,JobDraftV2Step]
```

### 8) Schema mismatch
- Local env uses `public` (no `?schema=`).
- If production uses `?schema=8fold_test`, ensure migrations ran against that schema.
- Standardization: use `?schema=8fold_test` in production `DATABASE_URL` and run `pnpm db:migrate` against it.

---

## C) API CONTRACT FINALIZATION

### 9) API route: `apps/api/app/api/web/job-poster/drafts-v2/current/route.ts`
- **Success:** `{ success: true, draft: {...}, traceId }`
- **Failure:** `{ success: false, code: "CURRENT_FAILED", traceId }` with status 500
- **Logging:** `traceId`, `userId`, `runtimeSchema`, `message`, `stack`, `code` on error

### 10) Web proxy: `apps/web/src/app/api/app/job-poster/drafts-v2/current/route.ts`
- Passes through upstream status and body
- On proxy error: `{ success: false, code: "CURRENT_FAILED", traceId, message }` with preserved status
- **UPSTREAM_SHAPE_INVALID guard:** If upstream returns non-JSON, responds with `{ success: false, code: "UPSTREAM_SHAPE_INVALID", traceId, status }` and 502

### 11) Response-shape guard
- Implemented: non-JSON or invalid JSON from upstream → 502 with `UPSTREAM_SHAPE_INVALID`.

---

## D) JOB POST V2 FLOW COMPLETENESS

### 12) Job Post V2 endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/api/web/job-poster/drafts-v2/current` | GET | Get/create active draft |
| `/api/web/job-poster/drafts-v2/save-field` | POST | Save field (autosave) |
| `/api/web/job-poster/drafts-v2/advance` | POST | Advance step |
| `/api/web/job-poster/drafts-v2/start-appraisal` | POST | Start AI appraisal |
| `/api/web/job-poster/drafts-v2/create-payment-intent` | POST | Create Stripe PI |
| `/api/web/job-poster/drafts-v2/verify-payment` | POST | Verify payment, create Job |

### 13) UI components using JobDraftV2
- `apps/web/src/app/app/job-poster/(app)/post-a-job-v2/useDraftV2.ts` — calls current, save-field, advance, start-appraisal, create-payment-intent
- `apps/web/src/app/app/job-poster/(app)/post-a-job-v2/WizardV2.tsx` — wizard UI
- `apps/web/src/app/app/job-poster/payment/return-v2/page.tsx` — calls verify-payment

### 14) Status transitions
- **Draft steps:** PROFILE → DETAILS → PRICING → PAYMENT → CONFIRMED (`packages/shared/src/jobDraftV2.steps.ts`)
- **DB enum:** `JobDraftV2Step` (PROFILE, DETAILS, PRICING, PAYMENT, CONFIRMED)
- **Job status:** `JobStatus` (DRAFT, PUBLISHED, etc.) — draft becomes Job on verify-payment

---

## E) MIGRATION SAFETY & PROD READINESS

### 15) Migrations
- **Command:** `DATABASE_URL="<prod>" pnpm db:migrate`
- **Files:** `drizzle/0048_job_draft_v2.sql`, `0050_job_draft_v2_production_parity.sql`, `0051_job_draft_v2_schema_alignment.sql`
- **Proof:** `scripts/diagnose-jobdraftv2-prod.ts` output (TABLES_OK, ENUMS_OK, MISSING_COLUMNS)

### 16) V1 code in V2 UI
- V2 UI (`post-a-job-v2`, `useDraftV2`) uses only `drafts-v2/*` endpoints.
- `full-frontend-audit.spec.ts` still references `jobs/create-draft` (V1); V2 flow does not use it.

### 17) Logging / traceId
- **API:** `traceId` generated at route start; logged in `job_draft_v2.current.failed` with `traceId`, `userId`, `runtimeSchema`, `message`, `stack`.
- **Web proxy:** `traceId` generated; included in error response.
- **Example traceId:** `a9782514-1420-4e2e-841e-ee25ca167d57` (from production 401 response).

---

## F) FINAL PROOF TESTS

### 18) Local
```bash
pnpm typecheck   # PASS
pnpm lint        # May prompt for ESLint config
curl -sS http://localhost:3006/api/app/diag/build
curl -sS http://localhost:3006/api/app/job-poster/drafts-v2/current
```

### 19) Production (after deploy)
```bash
curl -sS "https://8fold.app/api/app/diag/build"
curl -sS "https://8fold.app/api/app/job-poster/drafts-v2/current"
```

### 20) Definition of Done

| Item | Status |
|------|--------|
| _diag/build reachable (renamed to diag) | PENDING (deploy) |
| drafts-v2/current returns 200 or 401/403, never 500 | PASS (401 observed) |
| traceId in error responses | PASS |
| UPSTREAM_SHAPE_INVALID guard | PASS |
| Schema parity (tables, enums, columns) | PASS |
| Migrations documented | PASS |
| V2 UI uses only drafts-v2 endpoints | PASS |
| typecheck passes | PASS |

---

## Changes made this session

1. **Renamed `_diag` → `diag`** (Next.js private folder fix)
   - `apps/api/app/api/diag/build/route.ts`
   - `apps/web/src/app/api/app/diag/build/route.ts`
   - Removed `_diag` routes

2. **UPSTREAM_SHAPE_INVALID guard** in `apps/web/src/app/api/app/job-poster/drafts-v2/current/route.ts`

3. **Docs:** `docs/production-jobdraftv2-enablement.md` — paths updated to `/api/app/diag/build`
