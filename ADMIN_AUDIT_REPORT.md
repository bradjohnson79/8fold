## ADMIN BACKEND AUDIT REPORT (facts only)

Generated: `2026-02-12`

This report is backed by:

- `ADMIN_AUDIT_RUN_RESULTS.md` / `ADMIN_AUDIT_RUN_RESULTS.json` (deterministic, no-UI runner output)
- API server logs (gated by `ADMIN_AUDIT_LOG=1`) showing raw errors + stacks
- `ADMIN_AUDIT_DB_SCHEMA.md` (Postgres introspection output for 500 endpoints)

### How to run (repro)

```bash
# Terminal A (API server)
ADMIN_AUDIT_LOG=1 pnpm -C apps/api dev

# Terminal B (runner)
API_ORIGIN="http://127.0.0.1:3003" ADMIN_AUDIT_LOG=1 pnpm exec tsx apps/api/scripts/smoke-admin-audit.ts

# Phase 3 (DB schema evidence for 500s)
pnpm exec tsx apps/api/scripts/admin-audit-db-schema.ts
```

### Confirmed failure buckets

### Missing endpoints / misrouted paths (404)

**Confirmed by**: `ADMIN_AUDIT_RUN_RESULTS.md` (404 responses; Next.js 404 HTML body captured).

Endpoints returning 404 in the deterministic run:

- **Dashboard**: `GET /api/admin/dashboard`
- **Jobs status**: `GET /api/admin/jobs/status?limit=10`
- **Job appraisals (pending)**: `GET /api/admin/job-appraisals/pending`
- **Materials**: `GET /api/admin/materials`
- **Job holds**: `GET /api/admin/jobs/:jobId/holds`
- **Support inbox**: `GET /api/admin/support/inbox?take=5`
- **Settings mock refresh**: `GET /api/admin/settings/mock-refresh`
- **My roles**: `GET /api/admin/my/roles`
- **AI Email Campaigns**:
  - `GET /api/admin/ai-email-campaigns/regions`
  - `GET /api/admin/ai-email-campaigns/contacts`
  - `GET /api/admin/ai-email-campaigns/drafts?status=PENDING_APPROVAL`
  - `GET /api/admin/ai-email-campaigns/identities`
  - `GET /api/admin/ai-email-campaigns/send-queue`
  - `GET /api/admin/ai-email-campaigns/monitor`
- **AI Agent Pipeline**:
  - `GET /api/admin/ai-agent-pipeline/templates`
  - `GET /api/admin/ai-agent-pipeline/plans`
  - `GET /api/admin/ai-agent-pipeline/runs`
  - `GET /api/admin/ai-agent-pipeline/batches`
  - `GET /api/admin/ai-agent-pipeline/logs`

Impact:

- These calls are made by Admin UI pages (see `ADMIN_AUDIT_ENDPOINTS.md`), but the API server does not serve matching routes, so the Admin UI cannot render these sections.

### Query/runtime bug — Drizzle aliasing / table alias method mismatch (500)

**Confirmed by**:

- `ADMIN_AUDIT_RUN_RESULTS.md`: `GET /api/admin/routing-activity` → 500 with body `{"error":"...users.as is not a function"}`
- API log (with trace ID + stack) in `terminals/917478.txt`:
  - Error: `users.as is not a function`
  - Stack points to `apps/api/app/api/admin/routing-activity/route.ts` at `const routerUsers = users.as("routerUser")`
- `ADMIN_AUDIT_DB_SCHEMA.md`: tables exist (`Job`, `JobDispatch`, `RouterProfile`, `User`) and introspection output is recorded

Affected endpoint:

- `GET /api/admin/routing-activity`

Confirmed cause:

- Runtime error thrown before DB execution: the imported `users` object does not have `.as()` at runtime in this environment.

### Query/runtime bug — Drizzle subquery raw field not aliased (500)

**Confirmed by**:

- `ADMIN_AUDIT_RUN_RESULTS.md`: `GET /api/admin/support/tickets?take=5` → 500 with Drizzle message about missing alias for `"c"`
- API log (with trace ID + stack) in `terminals/917478.txt`:
  - Error occurs at `messageCount: msgCounts.c` in `apps/api/app/api/admin/support/tickets/route.ts`
- `ADMIN_AUDIT_DB_SCHEMA.md`: tables exist (`support_tickets`, `support_messages`) and introspection output is recorded

Affected endpoint:

- `GET /api/admin/support/tickets`

Confirmed cause:

- Runtime error thrown by Drizzle selection proxy: raw `sql\`count(*)\`` field needs an explicit alias (via `.as('...')`) before it can be referenced from the subquery.

### Schema mismatch — Prisma enum values (500)

**Confirmed by**:

- `ADMIN_AUDIT_RUN_RESULTS.md`:
  - `GET /api/admin/users` → 500
  - `GET /api/admin/users/contractors` → 500
  - Error body includes: `Value 'FURNITURE_ASSEMBLY' not found in enum 'TradeCategory'`
- API logs (with trace ID + Prisma stack) in `terminals/917478.txt`:
  - Prisma throws during `prisma.user.findMany()` and `prisma.contractorAccount.findMany()`
- DB evidence in `ADMIN_AUDIT_DB_SCHEMA.md`:
  - Enum listing query for `TradeCategory` is included for the failing endpoints
  - The set of enum labels does **not** include `FURNITURE_ASSEMBLY`

Affected endpoints:

- `GET /api/admin/users`
- `GET /api/admin/users/contractors`

Confirmed cause:

- Prisma is receiving/reading a value (`FURNITURE_ASSEMBLY`) that is not a valid label in the Postgres enum type `TradeCategory` in schema `8fold_test`, causing Prisma to throw and the API route to return 500.

### Schema mismatch — JobStatus enum values (500)

**Confirmed by**:

- `ADMIN_AUDIT_RUN_RESULTS.md`:
  - `GET /api/admin/jobs?status=COMPLETED` → 500
  - Response body contains `invalid input value for enum "JobStatus": "COMPLETED"` inside the failed query error message
- API log (with trace ID + raw Postgres error fields) in `terminals/917478.txt`:
  - Postgres error code: `22P02`
  - Raw message: `invalid input value for enum "JobStatus": "COMPLETED"`
- DB evidence in `ADMIN_AUDIT_DB_SCHEMA.md`:
  - Enum listing query for `JobStatus` is included for this endpoint

Affected endpoint:

- `GET /api/admin/jobs?status=COMPLETED` (used by Admin UI ledger page per `ADMIN_AUDIT_ENDPOINTS.md`)

Confirmed cause:

- The Admin UI requests `status=COMPLETED`, but the backing Postgres enum type `JobStatus` in schema `8fold_test` does not accept `COMPLETED` as a valid label, so Postgres rejects the query parameter value at execution time.

### Auth / permission layer (NOT a failure in this run)

**Confirmed by**: `ADMIN_AUDIT_RUN_RESULTS.md` shows 200 responses using a non-UI minted session token (no browser).

Examples:

- `GET /api/admin/jobs` → 200
- `GET /api/admin/contractors` → 200
- `GET /api/admin/job-drafts` → 200
- `GET /api/admin/payout-requests?status=REQUESTED` → 200
- `GET /api/admin/audit-logs?take=5` → 200
- `GET /api/admin/stats` → 200

This indicates admin RBAC via `authorization: Bearer <sessionToken>` / `x-session-token` is working in this environment for multiple endpoints.

