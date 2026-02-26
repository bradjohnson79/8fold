# Phase 2 - Core Admin V4 API Surface + v4 Admin-Domain Data

Date: 2026-02-26
Branch: v4-admin

## Routes Implemented

- `GET /api/admin/v4/overview`
- `GET /api/admin/v4/jobs`
- `GET /api/admin/v4/jobs/[id]`
- `GET /api/admin/v4/users`
- `GET /api/admin/v4/users/[id]`
- `GET /api/admin/v4/payouts/requests`
- `GET /api/admin/v4/payouts/transfers`
- `POST /api/admin/v4/payouts/adjustments`
- `GET /api/admin/v4/disputes`
- `GET /api/admin/v4/disputes/[id]`
- `GET /api/admin/v4/support/tickets`
- `GET /api/admin/v4/support/tickets/[id]`
- `POST /api/admin/v4/support/tickets/[id]/status`
- `GET /api/admin/v4/metrics`
- `GET /api/admin/v4/me`

## v4 Runtime Tables (schema)

- `v4_admin_jobs` (`apps/api/db/schema/v4AdminJob.ts`)
- `v4_admin_users` (`apps/api/db/schema/v4AdminUser.ts`)
- `v4_admin_payout_requests` (`apps/api/db/schema/v4AdminPayoutRequest.ts`)
- `v4_admin_transfers` (`apps/api/db/schema/v4AdminTransfer.ts`)
- `v4_admin_disputes` (`apps/api/db/schema/v4AdminDispute.ts`)
- `v4_admin_support_tickets` (`apps/api/db/schema/v4AdminSupportTicket.ts`)
- `v4_admin_integrity_alerts` (`apps/api/db/schema/v4AdminIntegrityAlert.ts`)
- `v4_admin_payout_adjustments` (`apps/api/db/schema/v4AdminPayoutAdjustment.ts`)
- `v4_admin_sync_checkpoints` (`apps/api/db/schema/v4AdminSyncCheckpoint.ts`)

Migration:
- `drizzle/0092_v4_admin_domain_tables.sql`

## Data Movement

Scripts:
- `apps/api/scripts/backfill-admin-v4-domain.ts`
- `apps/api/scripts/sync-admin-v4-domain.ts`
- Shared sync lib: `apps/api/scripts/admin-v4-domain-sync-lib.ts`

NPM scripts:
- `pnpm -C apps/api admin:v4:backfill`
- `pnpm -C apps/api admin:v4:sync`

## Sample Payloads (strict envelope)

Overview:
```json
{ "ok": true, "data": { "totalJobs": 0, "openJobs": 0, "activeAssignments": 0, "pendingPayouts": 0, "openDisputes": 0, "openSupportTickets": 0, "stripeRevenueMonth": 0, "stripeRevenueLifetime": 0, "integrityAlerts": 0 } }
```

Jobs:
```json
{ "ok": true, "data": { "jobs": [ { "id": "job_1", "status": "IN_PROGRESS", "country": "CA", "province": "BC", "regionCode": "BC", "trade": "PLUMBING", "tradeCategory": "PLUMBING" } ] } }
```

Users:
```json
{ "ok": true, "data": { "users": [ { "id": "u1", "email": "x@y.com", "role": "CONTRACTOR", "status": "ACTIVE" } ], "nextCursor": null } }
```

Payout requests:
```json
{ "ok": true, "data": { "payoutRequests": [] } }
```

Payout transfers:
```json
{ "ok": true, "data": { "items": [] } }
```

Payout adjustment create:
```json
{ "ok": true, "data": { "adjustment": { "id": "...", "userId": "...", "amountCents": 5000 } } }
```

Disputes list/detail:
```json
{ "ok": true, "data": { "disputes": [] } }
```
```json
{ "ok": true, "data": { "dispute": { "id": "d1", "status": "OPEN" } } }
```

Support list/detail/status:
```json
{ "ok": true, "data": { "tickets": [] } }
```
```json
{ "ok": true, "data": { "ticket": { "id": "t1", "status": "OPEN" } } }
```

Metrics:
```json
{ "ok": true, "data": { "revenue": { "monthCents": 0, "lifetimeCents": 0 }, "jobThroughput": { "totalJobs": 0, "completedJobs": 0 }, "contractorActivation": { "total": 0, "active": 0 }, "disputeRates": { "total": 0, "open": 0 } } }
```

Me:
```json
{ "ok": true, "data": { "admin": { "id": "...", "email": "...", "role": "ADMIN" } } }
```

## Stop Gate

Phase 2 deliverable complete.
