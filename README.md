# 8Fold Local (Monorepo)

Production money-routing app (v1) built exactly to the canonical spec.

## Structure (required)

```
8fold-local/
├─ apps/
│  ├─ mobile/        # Expo mobile app
│  ├─ admin/         # Next.js admin dashboard (App Router)
│  └─ api/           # Next.js API layer (App Router route handlers)
├─ packages/
│  └─ shared/        # Types, Zod schemas, constants
├─ prisma/
│  └─ schema.prisma
├─ .env.example
├─ package.json
├─ turbo.json
└─ README.md
```

## Hard rules (v1)

- Clerk only auth (no Supabase anywhere)
- Neon Postgres + Prisma (serverless-safe Prisma client)
- RBAC: `USER` (router) and `ADMIN` (ops)
- Mobile/Admin never access Neon directly (API only)
- Manual payouts (no Stripe)
- One active job per router (enforced in API logic; schema supports states)
- Ledger entries are append-only (immutability enforced by app logic; no update/delete endpoints)

## Local setup

1) Copy env:

`cp .env.example .env`

2) Fill in:

- `DATABASE_URL` (Neon)
- Clerk keys for API/Admin, and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` for Mobile
- `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL` (admin -> api), and `EXPO_PUBLIC_API_BASE_URL`

3) Install:

`pnpm install`

4) Generate Prisma client + migrate:

`pnpm db:generate`

`pnpm db:migrate`

5) Run apps:

- API: `pnpm --filter @8fold/api dev` (port 3002)
- Admin: `pnpm --filter @8fold/admin dev` (port 3001)
- Mobile: `pnpm --filter @8fold/mobile dev`

## Phase H: tests + release prep

### Tests

Tests run against a dedicated test schema/database via `DATABASE_URL_TEST`.

- Apply migrations to test DB:
  - `pnpm db:test:deploy`
- Run tests:
  - `pnpm --filter @8fold/api test`

### Seed dev data

- `pnpm seed:dev`

### EAS (mobile)

Config lives in `apps/mobile/eas.json`.

Typical flows:
- iOS TestFlight build: `eas build -p ios --profile production`
- Android internal build: `eas build -p android --profile production`

App Store hygiene reminders:
- No income guarantees
- Manual payout language (v1)
- Screenshots: job feed, job detail with earnings, wallet

## Notes

- Admin access is blocked for non-ADMIN users via `apps/admin/middleware.ts`, which calls `GET /api/rbac/admin-check` on the API using the Clerk session token.
- API creates an app `User` record on first authenticated call (default role `USER`). Promote a user to `ADMIN` directly in the DB for now (v1).

### Dev troubleshooting: Next.js `MODULE_NOT_FOUND` / vendor-chunk errors

If `apps/api` starts returning HTML 500s with errors like `Cannot find module ... .next/server/...vendor-chunks...`, your dev build cache is likely stale/corrupt.

- Delete: `rm -rf apps/api/.next`
- Restart dev: `pnpm dev` (or `pnpm --filter @8fold/api dev`)

