# Full Deployment Report — Contractor Accept Flow + Transactional Outbox

**Branch:** `feat/contractor-accept-outbox-schema-check`  
**Date:** 2026-03-07  
**Status:** Ready for production deployment (build fixes applied; awaiting successful Vercel deploy)

---

## Executive Summary

This release fixes the contractor invite accept 500 errors and implements the transactional outbox pattern so notification failures can never break core business transactions. It also adds startup schema verification to detect migration drift before requests are served.

**Key outcomes:**
- Contractor accept flow no longer fails due to legacy `INVITED` enum or notification pipeline errors
- Events are written to an outbox table inside transactions; a worker processes them asynchronously
- Schema capability check runs at API startup and warns if migrations are missing
- Build fixes applied for Vercel (crypto resolution, TypeScript payload casting)

---

## 1. Files Changed

### New Files

| File | Purpose |
|------|---------|
| `apps/api/db/schema/v4EventOutbox.ts` | Drizzle schema for event outbox table |
| `apps/api/instrumentation.ts` | Next.js instrumentation: schema check + outbox worker (every 5s) |
| `apps/api/src/events/processEventOutbox.ts` | Processes pending outbox events, calls notificationEventMapper |
| `apps/api/src/startup/checkSchemaCapabilities.ts` | Verifies dedupe_key, job_uniq, thread_uniq, routing_status enum |
| `drizzle/0129_jobs_routing_and_accept_columns.sql` | Jobs routing/accept columns |
| `drizzle/0130_routing_status_invite_accepted.sql` | INVITE_ACCEPTED in RoutingStatus enum |
| `drizzle/0131_v4_job_assignments_job_uniq.sql` | Unique index on v4_job_assignments(job_id) |
| `drizzle/0132_event_outbox.sql` | v4_event_outbox table + partial index |

### Modified Files

| File | Changes |
|------|---------|
| `apps/api/db/schema/index.ts` | Export v4EventOutbox |
| `apps/api/src/services/v4/contractorInviteService.ts` | Outbox writes instead of emitDomainEvent; removed INVITED |
| `apps/api/src/services/v4/routerRouteJobService.ts` | Removed `status: "INVITED"` (not in JobStatus enum) |
| `apps/api/src/services/v4/routerStage2ContractorSelectionService.ts` | Outbox writes instead of emitDomainEvent |
| `apps/api/src/services/v4/notifications/notificationService.ts` | Use `globalThis.crypto.randomUUID()` to avoid webpack crypto resolution |

---

## 2. Migrations to Apply (in order)

**Run these against production before deploying the API.**

```bash
# From repo root, with DATABASE_URL pointing to production
pnpm exec tsx scripts/apply-drizzle-sql-migrations.ts
```

Or apply manually in this order:

### 0128_v4_notifications_dedupe_key.sql (if not already applied)
```sql
ALTER TABLE v4_notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS v4_notifications_dedupe_key_uq
ON v4_notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
```

### 0129_jobs_routing_and_accept_columns.sql
```sql
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS routing_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS routing_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS first_routed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS poster_accept_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS jobs_routing_expires_at_idx ON jobs(routing_expires_at);
CREATE INDEX IF NOT EXISTS jobs_poster_accept_expires_at_idx ON jobs(poster_accept_expires_at);
```

### 0130_routing_status_invite_accepted.sql
```sql
ALTER TYPE public."RoutingStatus" ADD VALUE IF NOT EXISTS 'INVITE_ACCEPTED';
```

### 0131_v4_job_assignments_job_uniq.sql
```sql
CREATE UNIQUE INDEX IF NOT EXISTS "v4_job_assignments_job_uniq"
  ON "v4_job_assignments" ("job_id");
```

### 0132_event_outbox.sql
```sql
CREATE TABLE IF NOT EXISTS v4_event_outbox (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS v4_event_outbox_unprocessed_idx
ON v4_event_outbox (processed_at) WHERE processed_at IS NULL;
```

### Verify migrations applied
```sql
SELECT id FROM drizzle_sql_migrations
WHERE id IN (
  '0128_v4_notifications_dedupe_key.sql',
  '0129_jobs_routing_and_accept_columns.sql',
  '0130_routing_status_invite_accepted.sql',
  '0131_v4_job_assignments_job_uniq.sql',
  '0132_event_outbox.sql'
)
ORDER BY id;
```

---

## 3. Deployment Order

1. **Apply migrations** to production database (see Section 2).
2. **Merge PR** or deploy branch `feat/contractor-accept-outbox-schema-check`.
3. **Verify** API starts and schema check logs appear in startup.
4. **Smoke test** contractor accept flow: route job → contractor accepts → assignment succeeds, notifications delivered.

---

## 4. Build Fixes Applied (Vercel)

| Issue | Fix | Commit |
|-------|-----|--------|
| `Module not found: Can't resolve 'crypto'` | Use `globalThis.crypto.randomUUID()` instead of import | b25e4d4 |
| `node:crypto` UnhandledSchemeError | Same as above (reverted node:crypto) | b25e4d4 |
| `Type 'Record<string, unknown>' is not assignable to type 'DomainEvent payload union'` | Cast: `payload as DomainEvent["payload"]` | 919b34c |

---

## 5. Architecture Summary

### Contractor Accept Flow (before)
```
acceptInviteById()
  → assignment insert
  → job update
  → thread upsert
  → emitDomainEvent() ← notification errors could poison transaction
  COMMIT
```

### Contractor Accept Flow (after)
```
acceptInviteById()
  → assignment insert
  → job update
  → thread upsert
  → tx.insert(v4EventOutbox)  ← event written inside same transaction
  COMMIT

Then asynchronously (every 5s):
  processEventOutbox()
    → read unprocessed events
    → notificationEventMapper()
    → mark processed
```

### Schema Startup Check
- Runs in `instrumentation.ts` when API starts
- Verifies: v4_notifications.dedupe_key, v4_job_assignments_job_uniq, v4_message_threads_job_participants_uniq, routing_status enum values
- Informational only; does not block startup
- Logs `[Schema Check]` with ✓ or ⚠ per check

---

## 6. Commit History

```
919b34c fix: cast outbox payload to DomainEvent payload for TypeScript
b25e4d4 fix: use globalThis.crypto.randomUUID to avoid webpack node: scheme error
a707496 fix: use node:crypto for webpack resolution on Vercel (reverted)
0dceac1 feat: contractor accept flow + transactional outbox + schema startup check
```

---

## 7. Verification Checklist

Before deploy:
- [ ] Migrations 0128, 0129, 0130, 0131, 0132 applied to production
- [ ] `pnpm run build` passes locally

After deploy:
- [ ] API starts without errors
- [ ] `[Schema Check]` logs appear at startup (all ✓)
- [ ] Contractor accept: POST /api/web/v4/contractor/invites/{inviteId}/accept returns 200
- [ ] Notifications delivered within ~5–10 seconds
- [ ] No 500 errors in logs

---

## 8. Rollback Plan

If issues occur:
1. Revert to previous deployment.
2. Outbox table and worker are additive; old code paths still work if outbox is unused.
3. Migrations use `IF NOT EXISTS`; safe to leave applied.

---

## 9. PR / Merge

**Branch:** `feat/contractor-accept-outbox-schema-check`  
**Create PR:** https://github.com/bradjohnson79/8fold/pull/new/feat/contractor-accept-outbox-schema-check  
**Target:** `main`

Merge after migrations are applied and PR is approved.
