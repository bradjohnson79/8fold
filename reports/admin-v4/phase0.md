# Phase 0 - Legacy Freeze and Auth Inventory

Date: 2026-02-26
Branch: v4-admin

## 1. Auth Inventory

Legacy auth endpoints (frozen / stasis):
- `apps/api/app/api/admin/login/route.ts:3`
- `apps/api/app/api/admin/logout/route.ts:3`
- `apps/api/app/api/admin/signup/route.ts:3`
- `apps/api/app/api/admin/password/route.ts:3`
- `apps/api/app/api/admin/me/route.ts:3`

Legacy session/cookie module:
- `apps/api/src/lib/auth/adminSession.ts:7` -> cookie name `admin_session`
- `apps/api/src/lib/auth/adminSession.ts:57` -> session table `admin_sessions`
- `apps/api/src/lib/auth/requireAdmin.ts:45` -> legacy guard entrypoint

## 2. Freeze List

Frozen (must not be imported by Admin V4 routes):
- `apps/api/src/lib/auth/adminSession.ts`
- `apps/api/src/lib/auth/requireAdmin.ts`
- `apps/api/app/api/admin/login/route.ts`
- `apps/api/app/api/admin/logout/route.ts`
- `apps/api/app/api/admin/signup/route.ts`
- `apps/api/app/api/admin/password/route.ts`
- `apps/api/app/api/admin/me/route.ts`

Current stasis state:
- All five legacy auth routes now return strict-envelope `410 Gone`.

## 3. Placeholder Pages / Risks

Admin pages replaced with real V4 fetch + loading/error/empty:
- `apps/admin/src/app/(admin)/disputes/page.tsx:22`
- `apps/admin/src/app/(admin)/support/page.tsx:21`
- `apps/admin/src/app/(admin)/metrics/page.tsx:21`

Raw object rendering risks (stringified, not `[object Object]`, still flagged for UX hardening):
- `apps/admin/src/app/(admin)/disputes/[id]/page.tsx:26`
- `apps/admin/src/app/(admin)/support/[id]/page.tsx:26`
- `apps/admin/src/app/(admin)/payouts/integrity/page.tsx:226`
- `apps/admin/src/components/admin/JobActionGuards.tsx:167`

## 4. Endpoint Replacement Map

Legacy -> V4:
- `/api/admin/login` -> `/api/admin/v4/auth/login`
- `/api/admin/logout` -> `/api/admin/v4/auth/logout`
- `/api/admin/signup` -> `/api/admin/v4/auth/bootstrap`
- `/api/admin/password` -> `/api/admin/v4/auth/password`
- `/api/admin/me` -> `/api/admin/v4/auth/me`
- `/api/admin/dashboard` -> `/api/admin/v4/overview`
- `/api/admin/jobs*` -> `/api/admin/v4/jobs*`
- `/api/admin/users*` -> `/api/admin/v4/users*`
- `/api/admin/payout*` -> `/api/admin/v4/payouts/*`
- `/api/admin/support*` -> `/api/admin/v4/support/tickets*`
- `/api/admin/disputes*` -> `/api/admin/v4/disputes*`

## Stop Gate

Phase 0 deliverable complete.
