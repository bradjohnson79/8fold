# Hygiene Phase A — Table Naming Decisions

## Canonical Rule

**Canonical DB naming = snake_case lowercase table names in public schema.**

Production tables created by migrations 0054/0061 use:
- `jobs` (snake_case)
- `job_photos` (snake_case)

Legacy Prisma tables (e.g. `User`, `Contractor`, `JobPayment`) remain camelCase until migrated.

## Phase A Decisions

| Drizzle Table | DB Table | Action |
|---------------|----------|--------|
| **JobPhoto** | **job_photos** | **Update Drizzle** to use `job_photos` with snake_case columns. DB is canonical. |
| jobs | jobs | Already aligned. |
| jobPayments | JobPayment | No change (Prisma legacy). |
| routers | routers | Already aligned. |
| users | User | No change (Prisma legacy). |
| jobDispatches | JobDispatch | No change (Prisma legacy). |
| jobAssignments | JobAssignment | No change (Prisma legacy). |
| contractors | Contractor | No change (Prisma legacy). |

## JobPhoto → job_photos

**Preferred: Update Drizzle to match DB (fastest stability).**

- Table name: `job_photos`
- Columns: `job_id`, `created_at`, `storage_key` (snake_case)
- Update `apps/api/db/schema/jobPhoto.ts`
- Update all route code that references `jobPhotos.jobId` → `jobPhotos.job_id`, `jobPhotos.createdAt` → `jobPhotos.created_at`, `jobPhotos.storageKey` → `jobPhotos.storage_key`

**Views:** Not used. Drizzle update is low-risk.

## Future (Phase B)

- Migrate remaining Prisma tables to snake_case when touched.
- No views created in Phase A.
