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

