# Router V4 API Audit

**Date:** 2026-03-03

## V4-Only Usage (Dashboard)

The Router dashboard uses only V4 API paths:

| Page | Fetch Path | Proxies To |
|------|------------|------------|
| Available Jobs | `/api/web/v4/router/available-jobs` | Backend V4 |
| Route Job (contractors) | `/api/router/jobs/[jobId]/contractors` | `/api/web/v4/router/jobs/.../contractors` |
| Route Job (submit) | `/api/router/jobs/[jobId]/route` | `/api/web/v4/router/jobs/.../route` |
| Routed Jobs | `/api/web/v4/router/jobs/routed` | Backend V4 |
| Profile | `/api/web/v4/router/profile` | Backend V4 |
| Dashboard summary | `/api/web/v4/router/dashboard/summary` | Backend V4 |

## Legacy Routes (410 Gone)

All `/api/web/router/*` (without `v4`) return `410 Gone` on the backend. No dashboard code calls these paths directly.

## QA Check

Before merge: grep `apps/web/src/app/dashboard/router` for `/api/web/router/` (without `v4`) — should find no matches.
