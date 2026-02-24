# Production Schema Reconciliation — Jobs Table

Standardize the database so `public.jobs` (lowercase) is the canonical jobs table.

## Artifacts

| File | Purpose |
|------|---------|
| `migrations/diagnose_job_tables.sql` | Read-only diagnostic: list job tables, row counts |
| `migrations/0061_canonicalize_jobs_table.sql` | Create public.jobs, enum reconciliation, copy from legacy, rename legacy |
| `drizzle/0061_canonicalize_jobs_table.sql` | Same migration (for `pnpm db:migrate`) |
| `migrations/0062_drop_legacy_job_table.sql` | Optional: drop _Job_legacy_backup after verification |
| `apps/api/scripts/validate_jobs_schema.ts` | Compare public.jobs with Drizzle schema; exit non-zero on mismatch |

## Execution Order

1. **Diagnose** (read-only):
   ```bash
   psql $DATABASE_URL -f migrations/diagnose_job_tables.sql
   ```

2. **Canonicalize** (run migration):
   ```bash
   pnpm db:migrate
   ```
   Or apply manually:
   ```bash
   psql $DATABASE_URL -f migrations/0061_canonicalize_jobs_table.sql
   ```

3. **Validate** (after migration):
   ```bash
   pnpm -C apps/api validate:jobs-schema
   ```

4. **Drop legacy** (only after API returns 200, homepage loads):
   ```bash
   psql $DATABASE_URL -f migrations/0062_drop_legacy_job_table.sql
   ```

## Search Path Hardening

`apps/api/src/server/db/schemaLock.ts` now adds `options=-c search_path=public` to `DATABASE_URL` in production, eliminating schema ambiguity.

## Success Criteria

- Only one jobs table exists: `public.jobs`
- All application queries resolve to `public.jobs`
- No 500 on `/api/public/jobs/recent`
- Enums match Drizzle exactly
- `search_path` explicitly set to `public`
- Legacy tables preserved until explicit drop
