# Phase 4 - Tax System V4

Date: 2026-02-26
Branch: v4-admin

## Tables + Migration

- `v4_tax_regions` -> `apps/api/db/schema/v4TaxRegion.ts`
- `v4_tax_settings` -> `apps/api/db/schema/v4TaxSetting.ts`
- Migration: `drizzle/0094_v4_tax_system.sql`

## Resolver Service

- `apps/api/src/services/v4/taxResolver.ts`
- Contract:
  - `resolve({ amountCents, amountKind, country, province, mode? })`
  - returns `{ grossCents, netCents, taxCents, rate, mode }`
- Rounding: half-up cent rounding (`Math.floor(value + 0.5)`)

## Admin API

- `GET /api/admin/v4/tax/regions`
- `POST /api/admin/v4/tax/regions`
- `PATCH /api/admin/v4/tax/regions/[id]`
- `GET /api/admin/v4/tax/settings`
- `PATCH /api/admin/v4/tax/settings`

All guarded by `requireAdminV4`, strict envelope via `ok/err`.

## UI

Finance section in sidebar:
- `Tax Regions` -> `apps/admin/src/app/(admin)/tax/regions/page.tsx`
- `Tax Settings` -> `apps/admin/src/app/(admin)/tax/settings/page.tsx`

UI supports editable rates/toggles + loading/empty/error/retry.

## Stop Gate

Phase 4 deliverable complete.
