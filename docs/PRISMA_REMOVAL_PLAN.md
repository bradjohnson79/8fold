## Prisma removal plan (no execution yet)

This plan describes how Prisma will be removed as part of the Drizzle migration. It does **not** execute any route rewrites or schema changes.

### Current schema authority

- Postgres is canonical
- Drizzle is canonical application schema
- Prisma is a deprecated compatibility layer (read-only)

### Admin routes migration

Goal: remove Prisma dependencies from `apps/api/app/api/admin/**`.

1. **Identify Prisma-backed admin endpoints**
   - Start with allowlist in `scripts/detect-prisma-runtime.ts`
2. **Create Drizzle equivalents**
   - Implement the same reads using Drizzle tables/enums in `apps/api/db/schema/**`
3. **Keep response shapes stable**
   - No client-facing shape changes during migration
4. **Remove Prisma imports**
   - Once parity is proven via deterministic smoke runs, remove Prisma usage route-by-route
5. **Tighten guardrail**
   - Shrink the allowlist until it reaches zero

### Money routes migration

Scope: payout/ledger/materials escrow flows and any routes touching financial state.

1. Enumerate money-critical routes (admin + web)
2. For each route:
   - Confirm tables + constraints + indexes in Postgres
   - Implement Drizzle queries with explicit transaction boundaries
   - Add deterministic runner coverage
3. Only after full parity:
   - Remove Prisma dependencies in those modules

### Background jobs migration

Scope: cron/scheduler scripts under `scripts/**` and any `apps/api/src/jobs/**`.

1. Categorize jobs by risk:
   - Read-only analytics vs. state mutation vs. money movement
2. For each job:
   - Implement Drizzle + SQL equivalents
   - Add dry-run mode where possible
3. Remove Prisma client usage when parity is established

### Final removal checklist

- [ ] No imports from `@prisma/client` in `apps/api/app/api/**`
- [ ] No imports of Prisma wrapper modules in API runtime paths
- [ ] `scripts/detect-prisma-runtime.ts` allowlist is empty (and script passes)
- [ ] Remove Prisma CLI usage from docs/workflows (if any exist)
- [ ] Remove `prisma/` usage from build paths (keep archived snapshots under `docs/`)
- [ ] Remove Prisma deps (`prisma`, `@prisma/client`) after all runtime usage is eliminated

