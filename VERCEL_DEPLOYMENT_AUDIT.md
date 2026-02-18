## Vercel Deployment Audit (web/api)

Date: 2026-02-18
Branch: `fix/vercel-turbo-env-drizzle`
Scope: Vercel build failures reported for `main` at commit `a075f7a`

### Symptoms (Vercel)

- `@8fold/api` build fails during `next build` "Collecting page data"
- Error: `You can't specify 'public' as schema name...`
- Error: `DATABASE_URL is required (apps/api/src/server/db/drizzle.ts)`
- Turbo warning: multiple env vars set on Vercel project but missing from `turbo.json` so not available during the build

### Root Causes

1. **Turbo env passthrough**
   - Vercel runs `turbo run build`
   - Turbo will NOT expose platform env vars to task processes unless declared in `turbo.json`
   - Result: `DATABASE_URL`, Stripe, and Clerk env vars are empty during `@8fold/api#build`, causing module-load failures.

2. **Drizzle schema "public" incompatibility**
   - `apps/api/db/schema/_dbSchema.ts` used `pgSchema(DB_SCHEMA)`
   - When `DB_SCHEMA` resolves to `public` (no `?schema=` present), Drizzle throws because `public` is the default schema.

3. **TypeScript build failures (unrelated but surfaced)**
   - `apps/api/app/api/jobs/[id]/contractors/eligible/route.ts` contained strict TS errors, blocking `next build`.

### Fixes Applied

1. `turbo.json`
   - Added `globalEnv` and `tasks.build.env` entries so Vercel-injected env vars are available to Turbo build tasks.
   - This directly addresses the Vercel warning about missing env vars.

2. `apps/api/db/schema/_dbSchema.ts`
   - Special-cased `public` schema:
     - Use `pgTable()` (default schema) behind the existing `dbSchema.table(...)` callsites.
   - Export a single `.table()`-shaped object to keep schema definitions typechecking.

3. `apps/api/app/api/jobs/[id]/contractors/eligible/route.ts`
   - Fixed strict TypeScript issues (`implicit any`, generic `reduce<T>` on `any[]`).

### Verification (Local)

Commands:
- `pnpm turbo run build --filter @8fold/api`
- `pnpm turbo run build --filter @8fold/web --filter @8fold/admin`

Result:
- PASS: `@8fold/api` build completes (including "Collecting page data" and "Generating static pages")
- PASS: `@8fold/web` build
- PASS: `@8fold/admin` build

### Vercel Follow-up Checklist

- Ensure these env vars are configured on the Vercel project(s) that build `@8fold/api`:
  - `DATABASE_URL`
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (and `STRIPE_MODE` if explicitly set)
  - `CLERK_SECRET_KEY`, `CLERK_ISSUER`
  - `NOMINATIM_USER_AGENT` (if required by runtime routes)

