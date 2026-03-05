# Router Demo E2E — Runbook

Controlled demo bubble: 1 router, 1 contractor, 3 DEMO jobs in Langley, BC.

## Prerequisites

- `apps/api/.env.local` with valid `DATABASE_URL`
- Migration 0125 applied (coordinates + country_code fixes)

## Run Order

```bash
# 1. Apply migration (if not already applied)
pnpm db:migrate

# 2. Seed demo data (idempotent — safe to re-run)
pnpm exec tsx scripts/seed-router-demo.ts

# 3. Verify pipeline
pnpm exec tsx scripts/verify-router-demo.ts

# 4. Full audit (optional)
pnpm exec tsx scripts/audit-router-available-jobs.ts
```

## Demo Accounts

| Role       | Email                       | User ID                    | Location    |
|------------|-----------------------------|----------------------------|-------------|
| Router     | demo.router@8fold.local     | demo-router-ca-bc-001      | Langley, BC |
| Contractor | demo.contractor@8fold.local | demo-contractor-ca-bc-001  | Langley, BC |

## Demo Jobs

| Title                                 | Trade    | Type     | Job ID               |
|---------------------------------------|----------|----------|----------------------|
| DEMO: Langley Fence Repair (2 panels) | HANDYMAN | urban    | demo-job-fence-001   |
| DEMO: Langley Couch Move              | MOVING   | urban    | demo-job-couch-001   |
| DEMO: Langley Cabinet Mount           | HANDYMAN | regional | demo-job-cabinet-001 |

## Manual Verification

1. Login as demo router
2. Navigate to `/dashboard/router/jobs/available`
3. Confirm 3 DEMO jobs visible
4. Select a job, verify contractor appears in eligible list
5. Route the job, verify contractor receives invite

## Identifying Demo Records

All demo jobs use:
- Title prefix: `DEMO:`
- `mock_seed_batch = 'DEMO_ROUTER_E2E'`
- `is_mock = false` (required for contractor discovery pipeline)
- `job_source = 'MOCK'`

## Cleanup

```sql
DELETE FROM jobs WHERE mock_seed_batch = 'DEMO_ROUTER_E2E';
```

User records can remain (they don't affect production flows).
