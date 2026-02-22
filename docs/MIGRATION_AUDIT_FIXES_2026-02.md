# Migration Audit Fixes (2026-02)

Audit of Drizzle migrations for production compatibility. Fixes applied to resolve enum/type mismatches and schema hardcoding.

## Issues Fixed

### 1. **0011_stripe_connect_fields.sql**
- **Problem:** Created indexes on `stripeAccountId` without adding the column; hardcoded `8fold_test` schema
- **Fix:** Added `ADD COLUMN IF NOT EXISTS "stripeAccountId"` before index creation; rewrote to use `current_schema()` for schema-agnostic execution

### 2. **0044_stripe_only_payouts.sql**
- **Problem:** `upper("payoutMethod")` on enum without `::text` cast; hardcoded `8fold_test` schema
- **Fix:** Changed to `upper("payoutMethod"::text)`; rewrote to use `current_schema()` and `format()` for schema-agnostic execution

### 3. **0047_jurisdiction_country_state_codes.sql**
- **Problem:** `COALESCE` mixing text and `CountryCode` enum; subqueries referenced columns that may not exist (e.g. `RouterProfile.stateProvince`)
- **Fix:** Build stateCode coalesce dynamically from columns that exist; added defensive check for missing `country` column; made schema-agnostic with `current_schema()` and `format()`

### 4. **0049_parts_materials.sql**
- **Problem:** PmRequest REFERENCES public."Escrow"("id") but Escrow table may not exist
- **Fix:** Conditional CREATE TABLE: use escrowId FK only when Escrow exists; otherwise create escrowId as plain uuid

### 5. **0052_job_draft_v3.sql**
- **Problem:** CREATE TYPE when enums already exist; CREATE INDEX on potentially missing column
- **Fix:** Idempotent enum creation (check pg_type first); conditional index creation (only if userId column exists)

### 6. **0057_canonicalize_public_job.sql**
- **Problem:** ALTER TABLE public."Job" fails when 0054 already renamed Job → jobs
- **Fix:** Wrap column adds and index in DO block; skip entire section when public."Job" does not exist

## Schema Handling

When `DATABASE_URL` includes `?schema=8fold_test`, migrations run in that schema. When it does not, they run in `public`. All fixed migrations now use `current_schema()` so they work in both cases.

## Verification

After applying fixes, run:

```bash
pnpm db:migrate
```

## Controlled Migration Execution (2026-02)

Migrations were run one at a time with safe patches applied on each failure. All 63 migrations completed successfully. JobDraft table and 0052 migration are confirmed applied.
