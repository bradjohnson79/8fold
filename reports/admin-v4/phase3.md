# Phase 3 - Notifications V4

Date: 2026-02-26
Branch: v4-admin

## Data Contract + Migration

- Schema: `apps/api/db/schema/v4Notification.ts`
- Migration: `drizzle/0093_v4_notifications_v2_contract.sql`

Columns in contract:
- `id`, `userId`, `role`, `type`, `title`, `message`, `entityType`, `entityId`, `read`, `priority`, `createdAt`

Indexes in migration/schema:
- `user_id`, `read`, `priority`, `created_at`

## Service

- `apps/api/src/services/v4/notificationService.ts`
- `createNotification(input)` inserts and returns row
- Optional email adapter behind env flags
- Email send failures are swallowed/logged (non-blocking)

## Admin API

- `GET /api/admin/v4/notifications`
- `POST /api/admin/v4/notifications/[id]/read`
- Guarded by `requireAdminV4`, envelope via `ok/err`

## UI

- Sidebar item added: `Notifications`
- Page: `apps/admin/src/app/(admin)/notifications/page.tsx`
- Includes priority filter, mark-read, loading/empty/error/retry

## Trigger Wiring Status

Implemented in this rollout:
- Service available for use and non-blocking behavior.
- Route-layer read/mark-read fully wired.

Remaining expansion (service-layer event matrix) is partially implemented and should be completed in follow-up for full platform coverage (job lifecycle, PM lifecycle, payment/webhook/integrity event fanout).

## Stop Gate

Phase 3 deliverable complete (with noted trigger expansion follow-up).
