## Vercel Deployment Follow-up

Date: 2026-02-18
Repo: `bradjohnson79/8fold`
Scope: Vercel deploy activity for `apps/api` (and related monorepo build governance)

### Executive Status

- `8fold-api` preview deployment for fix branch: SUCCESS (Vercel status: Ready)
- `8fold-api` production deployment for `main`: REPORTED SUCCESS (Ready)
- Runtime smoke: a 500 page was observed post-deploy with `MIDDLEWARE_INVOCATION_FAILED` (requires Vercel log triage)
- Security hygiene PR (audit log removal): NOT merged into `main` yet (remote branch exists)

---

## 1) Incident Summary (Vercel Build Failure)

Vercel build was run from `main` at commit `a075f7a` via:
- install: `pnpm install`
- build: `turbo run build`
- root directory: `apps/api` (Next.js preset)

Observed failure signatures (from Vercel logs):
- Turbo env warning: Vercel env vars set, but missing from `turbo.json` so not available during build tasks.
- Next build failed during "Collecting page data" for API routes.
- Drizzle error:
  - `You can't specify 'public' as schema name...`
- DB env error:
  - `DATABASE_URL is required (apps/api/src/server/db/drizzle.ts)`

---

## 2) Root Cause Analysis

### 2.1 Turbo env passthrough on Vercel

When Vercel runs `turbo run build`, Turbo will not automatically pass platform env vars into task processes unless declared in `turbo.json`.

Impact:
- During `@8fold/api#build`, `process.env.DATABASE_URL` and other secrets were effectively unset.
- This caused module initialization failures during Next's route data collection.

### 2.2 Drizzle schema wrapper: `public` is special

`apps/api/db/schema/_dbSchema.ts` used `pgSchema(DB_SCHEMA)`.

When schema resolves to `public` (no `?schema=` in `DATABASE_URL`), Drizzle throws because `public` is the default schema and should not be passed to `pgSchema("public")`.

### 2.3 Strict TypeScript surfaced after env/schema issues

Once the build could proceed further, a strict TypeScript issue in:
- `apps/api/app/api/jobs/[id]/contractors/eligible/route.ts`

blocked `next build` under Vercel’s typechecking.

---

## 3) Remediation Implemented (Merged to `main`)

Vercel fix branch:
- Branch: `fix/vercel-turbo-env-drizzle`
- Branch head commit: `86e9543`
- Merged to `origin/main` as: `a80f827` (PR `#1`)

Changes in merge commit `a80f827`:
- `turbo.json`
  - Added `globalEnv` and `tasks.build.env` entries for Vercel-injected secrets
  - Goal: make `DATABASE_URL`, Stripe, and Clerk env vars available during Turbo builds on Vercel
- `apps/api/db/schema/_dbSchema.ts`
  - Special-cased `public` schema to use default-schema tables (via `pgTable`) behind `dbSchema.table(...)`
  - Preserved the existing schema API surface for all schema callsites
- `apps/api/app/api/jobs/[id]/contractors/eligible/route.ts`
  - Fixed strict TS typing issues that blocked `next build`
- `VERCEL_DEPLOYMENT_AUDIT.md`
  - Added detailed build failure + fix documentation

---

## 4) Vercel Deployment Outcomes

### 4.1 Preview deployment (fix branch)

Preview deployment succeeded for:
- Source branch: `fix/vercel-turbo-env-drizzle`
- Commit: `86e9543`
- Vercel status: Ready

### 4.2 Production deployment (main)

Production deployment was reported successful for:
- Source branch: `main`
- Remote head: `a80f827` (current `origin/main`)

### 4.3 Runtime anomaly observed post-deploy

After a successful deploy, a page-level 500 was observed:
- `500: INTERNAL_SERVER_ERROR`
- Code: `MIDDLEWARE_INVOCATION_FAILED`

Required follow-up:
- Inspect `8fold-api` Vercel project logs for the request ID from the error page
- Confirm whether the failure is:
  - global middleware crash (affects all routes), or
  - root route-only behavior, while `/api/system/health` remains healthy

Recommended runtime checks (production URL):
- `GET /api/system/health` => `200` JSON
- `GET /api/health` => `200` JSON
- `GET /api/me` => JSON `401` when signed out (no HTML / no Clerk UI redirect)

---

## 5) Security Follow-up (GitGuardian entropy secret)

Branch prepared (not merged to `main` at time of writing):
- Branch: `chore/remove-e2e-audit-log`
- Commit: `a0d599c`
  - deletes tracked `E2E_AUDIT_LOG.json`
  - adds `.gitignore` guard to prevent re-commit

Important note:
- This is non-destructive remediation (no history rewrite).
- The secret/token remains present in historical commits unless a history purge is explicitly authorized.
- Token(s) should be treated as compromised and revoked/expired server-side.

---

## 6) Current Git State (Remote)

Remote branch heads:
- `origin/main` = `a80f827`
- `origin/fix/vercel-turbo-env-drizzle` = `86e9543`
- `origin/chore/remove-e2e-audit-log` = `a0d599c`

Local state may differ if `main` is not pulled after merge.

---

## 7) Action Items

### 7.1 Required

- Verify production runtime (not just deployment) using `/api/system/health` and `/api/me`.
- Investigate and resolve `MIDDLEWARE_INVOCATION_FAILED` using Vercel Logs.

### 7.2 Recommended

- Merge PR `#2` (`chore/remove-e2e-audit-log`) after updating branch against latest `main` so Preview deploy succeeds.
- Re-check Vercel env vars are configured for all relevant environments (Preview + Production), especially:
  - `DATABASE_URL`
  - `CLERK_SECRET_KEY`, `CLERK_ISSUER`
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - `NOMINATIM_USER_AGENT`

