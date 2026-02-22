# JobDraft Migration 0052 — Production Application Guide

**Migration:** `drizzle/0052_job_draft_v3.sql`  
**Creates:** `JobDraft` table, `JobDraftStatus` and `JobDraftStep` enums  
**Required for:** Post a Job V3 wizard (`/app/job-poster/post-a-job-v3`)

---

## Symptoms if Migration Is Not Applied

- **500 on `/api/job-draft`** when loading or saving a job draft
- Error in Vercel logs: `relation "JobDraft" does not exist` or `relation "JobDraft" does not exist`
- Post a Job V3 page shows: `Failed query: select ... from "JobDraft" where ...`

---

## 1. Verify Migration Status (Local with Prod DB)

Run against production `DATABASE_URL`:

```bash
# From repo root, with production DATABASE_URL set
DATABASE_URL="postgresql://..." pnpm exec tsx scripts/check-job-draft-migration.ts
```

Or use the existing audit script:

```bash
DATABASE_URL="postgresql://..." pnpm -C apps/api exec tsx scripts/productionAuthDbAudit.ts
```

Check output for:
- `tables` includes `JobDraft` (or `jobdraft` if unquoted)
- `migrations` includes `0052_job_draft_v3.sql`

---

## 2. Apply Migration Manually

Migrations are **not** run automatically on Vercel deploy. You must run them manually against production.

```bash
# From repo root
# Ensure apps/api/.env.local has DATABASE_URL, or pass it explicitly:
DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require" pnpm db:migrate
```

The script:
- Loads `DATABASE_URL` from `apps/api/.env.local` (or env)
- Connects to the database
- Applies any unapplied migrations from `drizzle/*.sql` in order
- Records applied migrations in `drizzle_sql_migrations`

**Schema note:** If `DATABASE_URL` includes `?schema=8fold_test`, migrations run in that schema. Production typically uses `public` (no `?schema=`).

---

## 3. Using Vercel Logs to Diagnose

1. **Vercel Dashboard** → Your API project (e.g. `api.8fold.app`) → **Logs**
2. Filter by **Function** or search for `job-draft` or `JobDraft`
3. Look for:
   - `relation "JobDraft" does not exist` → migration not applied
   - `Failed query: select ... from "JobDraft"` → same cause
   - `permission denied for table "JobDraft"` → different issue (role/permissions)

4. **Real-time logs:** Deployments → select deployment → **Functions** → click a function log stream

5. **Build logs** won’t show runtime DB errors; use **Runtime Logs** or **Function Logs**.

---

## 4. Post-Apply Verification

After running `pnpm db:migrate`:

1. **Check migration record:**
   ```sql
   SELECT id FROM drizzle_sql_migrations WHERE id = '0052_job_draft_v3.sql';
   ```

2. **Check table exists:**
   ```sql
   SELECT 1 FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'JobDraft';
   ```

3. **Test the flow:** Open Post a Job V3 and confirm the wizard loads without 500 errors.

---

## 5. CI / Deploy Integration (Optional)

To run migrations as part of deploy, add a step before the Vercel build (e.g. in GitHub Actions):

```yaml
- name: Run DB migrations
  run: pnpm db:migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

Ensure `DATABASE_URL` is set for production in your secrets.
