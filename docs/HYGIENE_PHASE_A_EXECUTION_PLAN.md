# Hygiene Phase A — Execution Plan

## Migration Order

1. **0063_jobs_legacy_cleanup.sql** — Run first
   - Drops `amountcents`, `paymentstatus`, `publicstatus`
   - Casts `payment_status` and `public_status` from text to enum (DROP DEFAULT before ALTER, then SET DEFAULT)

## How to Execute

### 1. Run Migration

```bash
pnpm -C apps/api hygiene:phaseA
```

Or manually:
```bash
cd apps/api && DOTENV_CONFIG_PATH=.env.local tsx scripts/run-hygiene-phaseA-migration.ts
```

### 2. Verify

```bash
pnpm -C apps/api hygiene:phaseA:check
```

### 3. Runtime Check

```bash
# Start API
pnpm -C apps/api dev

# In another terminal:
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3003/api/public/jobs/recent?limit=2"
# Expected: 200

curl -s -o /dev/null -w "%{http_code}" "http://localhost:3003/api/web/router/routable-jobs"
# Expected: 200 or 401 (auth required)
```

## Code Changes (Phase A)

| File | Change |
|------|--------|
| `apps/api/db/schema/jobPhoto.ts` | Table `JobPhoto` → `job_photos`, columns camelCase → snake_case |
| `apps/api/app/api/public/jobs/recent/route.ts` | jobId→job_id, createdAt→created_at |
| `apps/api/app/api/jobs/[id]/route.ts` | jobId→job_id, storageKey→storage_key |
| `apps/api/app/api/public/jobs/by-location/route.ts` | jobId→job_id, createdAt→created_at |
| `apps/api/app/api/jobs/[id]/contractor-complete/route.ts` | jobId→job_id in insert |
| `apps/api/app/api/admin/jobs/image-audit/route.ts` | jobId→job_id in join |
| `apps/api/app/api/admin/jobs/image-audit/assign/route.ts` | jobId→job_id, storageKey→storage_key, createdAt→created_at |
| `apps/api/app/api/admin/jobs/visual-integrity/route.ts` | jobId→job_id |
| `apps/api/src/jobs/mockJobRemoval.ts` | jobId→job_id |
| `apps/api/src/jobs/mockJobGuards.ts` | jobId→job_id |
| `apps/api/scripts/seed-mock-jobs.ts` | jobId→job_id, createdAt→created_at in insert |
| `apps/api/scripts/seed-router-dashboard-e2e-drizzle.ts` | jobId→job_id in delete |
| `apps/api/app/api/admin/jobs/[id]/route.ts` | Selective contractor columns (avoids stripeAccountId/stripePayoutsEnabled if missing in DB) |

## Rollback Notes

- **Migration 0063:** Re-adding dropped columns would require a new migration. The legacy columns (`amountcents`, `paymentstatus`, `publicstatus`) are duplicates of `amount_cents`, `payment_status`, `public_status`; no rollback needed if data is in canonical columns.
- **Drizzle job_photos:** Reverting would require changing `jobPhoto.ts` back to `JobPhoto` with camelCase and reverting all route/script changes. Production DB has `job_photos`; reverting Drizzle would break production.

## Success Criteria

- [x] `/api/public/jobs/recent` returns 200
- [x] No schema-related 500s for Tier 1/2 endpoints
- [x] `hygiene:phaseA:check` passes
- [x] Drizzle schema aligns with production for Tier 1/2

## Note: 8fold_test Schema

Seed scripts (`seed-mock-jobs`, `seed-router-dashboard-e2e-drizzle`) target `8fold_test` which may still have `JobPhoto` (camelCase). If seeds fail, migrate 8fold_test to have `job_photos` or run seeds against production.
