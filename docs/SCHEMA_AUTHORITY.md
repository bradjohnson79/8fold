## Schema authority

### Canonical sources

- **Postgres**: canonical database schema
- **Drizzle**: canonical application-layer schema (tables + enums) that must match Postgres
- **Prisma**: **deprecated** compatibility layer (read-only; legacy infrastructure)

### Rules (effective immediately)

All future schema changes must:

1. **Update Postgres first**
2. **Update Drizzle to match Postgres**
3. **NEVER update Prisma schema** (`prisma/schema.prisma`) for new changes

### Notes

- Prisma is frozen and will be removed after the Drizzle migration is complete.
- If a mismatch is detected, treat Postgres enum/table reality as the source of truth and adjust Drizzle accordingly (not Prisma).

### Environment boundaries (schema lock)

| Environment | Schema | Notes |
|-------------|--------|-------|
| **Production** | `public` only | Explicit `?schema=public` in DATABASE_URL. No dynamic schema. |
| **Local** | May use `8fold_test` | Set `?schema=8fold_test` in `.env.local` for isolated dev. |
| **Test** | May use `8fold_test` | Same as local. |

**Rules:**

- Production **always** uses `public`. Code enforces this at boot.
- Do **not** dynamically change schema based on implicit defaults.
- `8fold_test` is **test-only**; never used in production.
- Run `pnpm verify:prod-schema` before deployment. CI should fail if schema mismatch.

