## Migration Hygiene (Authoritative)

### Decision

This repo uses **Drizzle SQL migrations as the single source of truth** for schema changes.

- **All DB patches must land in `drizzle/*.sql`** (lexicographically ordered, e.g. `0003_...sql`).
- **Prisma migrations are frozen**: never add new migrations under `prisma/migrations/` and never run Prisma migrate.

This prevents accidental “half-applied” DB state and keeps Drizzle as the sole authority.

### How to migrate locally (dev)

Run:

- `pnpm db:migrate`

This runs `pnpm db:migrate:drizzle` to apply all `drizzle/*.sql`.

### Why this exists

Prisma optimized for convenience; Drizzle requires explicit correctness.
We keep the `prisma/` folder only as a historical reference while freezing Prisma in-place.

