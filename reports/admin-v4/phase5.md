# Phase 5 - Admin UI Wiring (No Placeholders)

Date: 2026-02-26
Branch: v4-admin

## Fetch/Proxy Layer

- Added strict V4 fetch client:
  - `apps/admin/src/server/adminApiV4.ts`
- Added V4 proxy routes:
  - `apps/admin/src/app/api/admin/v4/[[...path]]/route.ts`
  - `apps/admin/src/app/api/admin/v4/auth/*`

## Auth Path Corrections

Updated admin UI/actions to use `/api/admin/v4/auth/*`:
- `apps/admin/src/app/(auth)/login/LoginForm.tsx`
- `apps/admin/src/app/(auth)/admin-signup/AdminSignupClient.tsx`
- `apps/admin/src/components/LogoutButton.tsx`
- `apps/admin/src/components/NotAuthorized.tsx`
- compatibility proxies in `apps/admin/src/app/api/admin/*.ts` now forward to `/api/admin/v4/auth/*`

## Placeholder Replacement

Implemented real data pages:
- `apps/admin/src/app/(admin)/disputes/page.tsx`
- `apps/admin/src/app/(admin)/support/page.tsx`
- `apps/admin/src/app/(admin)/metrics/page.tsx`
- `apps/admin/src/app/(admin)/notifications/page.tsx`
- `apps/admin/src/app/(admin)/tax/regions/page.tsx`
- `apps/admin/src/app/(admin)/tax/settings/page.tsx`

Also added detail pages:
- `apps/admin/src/app/(admin)/disputes/[id]/page.tsx`
- `apps/admin/src/app/(admin)/support/[id]/page.tsx`

## Sidebar Updates

- Added Notifications
- Added Finance section: Tax Regions / Tax Settings
- File: `apps/admin/src/components/layout/AdminSidebar.tsx`

## Legacy Auth Stasis Conversion

Converted to `410 Gone` strict envelope:
- `apps/api/app/api/admin/login/route.ts`
- `apps/api/app/api/admin/logout/route.ts`
- `apps/api/app/api/admin/signup/route.ts`
- `apps/api/app/api/admin/password/route.ts`
- `apps/api/app/api/admin/me/route.ts`

## Screenshots

- Directory created: `reports/admin-v4/screenshots/`
- Screenshot capture was not executed in this terminal run (no browser-capture step run).

## Stop Gate

Phase 5 deliverable complete (screenshots pending capture).
