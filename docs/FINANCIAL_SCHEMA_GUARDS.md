# Financial Schema Guards

Permanent CI guardrails to prevent financial schema drift and enforce public-schema alignment.

## Rule: No 8fold_test in Runtime or New Migrations

- **Production** uses `public` schema only.
- **Runtime code** must never hardcode `8fold_test`. Use `getResolvedSchema()` or Drizzle.
- **New migrations** (0068 and later) must target `public` only. Historical migrations (0000–0067) are grandfathered.

## CI Guard Script

`scripts/financial-schema-guard.sh` fails if:

1. **Runtime purity**: `apps/api/src` or `apps/api/app` contains `8fold_test` (excluding `__tests__`).
2. **New migration purity**: Any migration in `drizzle/` with number ≥ 0068 contains `8fold_test`.

## Usage

```bash
bash scripts/financial-schema-guard.sh
```

Exit 0 = PASS. Exit 1 = FAIL (CI must fail).

## Integration

- **package.json**: `"guard:financial-schema": "bash scripts/financial-schema-guard.sh"`
- **CI**: Invoked via `pnpm guard:financial-schema` in `scripts/ci-gate.mjs` (runs before ai:guard)

## Exemptions

- **Tests** (`__tests__`): May set `DATABASE_URL?schema=8fold_test` for local test DB.
- **Scripts** (`scripts/`): Audit/migration scripts may reference 8fold_test when operating on dev DBs.
- **Historical migrations** (0000–0067): Grandfathered; do not modify.

## References

- `apps/api/src/server/db/schemaLock.ts` — `getResolvedSchema()` for schema-agnostic queries
- `apps/api/db/schema/_dbSchema.ts` — Drizzle schema resolution
- `drizzle/0068_public_escrow_partsmaterial_ledger.sql` — Canonical public financial schema
