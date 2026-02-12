## Prisma Runtime Usage Report (outside Admin) — 2026-02-12

Scope: **runtime Prisma usage outside** `apps/api/app/api/admin/**`.

Goal (Phase 4): remove all runtime Prisma usage from **core domain** (jobs, router dispatch, contractor flows, payouts/ledger, materials escrow), preserving API contracts and financial integrity.

Excluded from this scan:
- Legacy frozen snapshot docs under `docs/` (schema snapshots / diff reports)
- Admin API layer (already removed in Phase 3)

---

### Canonical inventory: remaining Prisma runtime touchpoints

#### Core Prisma client wrapper (must go last)

- `apps/api/src/db/prisma.ts`
  - Imports `@prisma/client` and creates the Prisma singleton proxy (frozen writes).

#### API routes (runtime)

##### Financial / ledger / payout / escrow (HIGH / VERY HIGH risk)

- `apps/api/app/api/payout-methods/route.ts`
  - **Writes**: `PayoutMethod`, `AuditLog`, and updates role payout settings in `RouterProfile`, `JobPosterProfile`, `ContractorAccount`.
  - **Also touches** Stripe onboarding side effects (must keep behavior identical).

- `apps/api/app/api/jobs/[id]/router-approve/route.ts`
  - **Writes**: `Job` status transition, `JobAssignment` completion, **`LedgerEntry` credits** (router earning + broker fee), `AuditLog`, and increments `routers.routesCompleted`.

- `apps/api/app/api/web/materials-requests/route.ts`
  - **Reads/Writes**: `Job`, `JobAssignment`, `User`, `Contractor`, `MaterialsRequest` (+ items), `AuditLog`.

- `apps/api/app/api/web/materials-requests/[id]/receipts/upload/route.ts`
  - **Writes**: `MaterialsReceiptSubmission`, `MaterialsReceiptFile`, `AuditLog`.

- `apps/api/app/api/web/materials-requests/[id]/receipts/submit/route.ts`
  - **Writes**: `MaterialsReceiptSubmission`, `MaterialsRequest`, `AuditLog`.

- `apps/api/app/api/web/materials-requests/[id]/reimburse/release/route.ts`
  - **VERY HIGH risk**.
  - **Writes**: `ContractorLedgerEntry`, `ContractorPayout`, `MaterialsEscrow`, `MaterialsEscrowLedgerEntry`, `JobPosterCredit` (credit path), `MaterialsRequest`, `AuditLog`.
  - **Also**: Stripe refund path updates `MaterialsEscrowLedgerEntry` + `MaterialsPayment` status.

##### Job lifecycle + router dispatch (MEDIUM / HIGH risk)

- `apps/api/app/api/jobs/[id]/contractors/dispatch/route.ts`
  - **Writes**: `JobDispatch`, `AuditLog` (within transaction)
  - **Reads**: `Job`, `RouterProfile`, `Contractor`, existing `JobDispatch` pending window

- `apps/api/app/api/jobs/[id]/router-hold/route.ts`
  - **Writes**: `Job` transition to `COMPLETION_FLAGGED`, `JobHold`, `AuditLog`

- `apps/api/app/api/jobs/[id]/customer-review/route.ts`
  - **Writes**: `Job` transition to `CUSTOMER_APPROVED`/`CUSTOMER_REJECTED`, `JobHold` (dispute), `AuditLog`
  - **Follow-up** (post-tx): reads `Job`/`RouterProfile` and writes `AuditLog` notification event

##### Read-only endpoints (LOW risk)

- `apps/api/app/api/web/job-poster/jobs/[id]/resume-pricing/route.ts` (read-only job fields)
- `apps/api/app/api/web/router-incentives/route.ts` (counts; includes “no ACTIVE holds” filter)
- `apps/api/app/api/web/contractor-incentives/route.ts` (contractor lookup + waiver audit + counts)
- `apps/api/app/api/web/contractor/repeat-requests/route.ts` (list)
- `apps/api/app/api/web/job-poster/repeat-contractor/status/route.ts` (status)

##### No-op compatibility route (LOW risk; Prisma is unnecessary)

- `apps/api/app/api/web/materials-requests/[id]/approve/route.ts`
  - Returns 409 with compatibility guidance; Prisma import is unused for behavior.

#### Server modules / services / tests (runtime / test runtime)

##### Pricing helpers (LOW risk; only Prisma enum TYPE imports)

- `apps/api/src/pricing/pricingIntel.ts` (`TradeCategory`, `JobType`)
- `apps/api/src/pricing/aiAppraisal.ts` (`TradeCategory`, `JobType`)
- `apps/api/src/pricing/tradeDeltas.ts` (`TradeCategory`)
- `apps/api/src/pricing/validation.ts` (`TradeCategory`)

##### Audit logging helper (MEDIUM; writes audit logs)

- `apps/api/src/audit/jobPostingAudit.ts`

##### Error classifier (MEDIUM; Prisma error class references)

- `apps/api/src/http/jobPosterRouteErrors.ts` (references `Prisma.*Error` classes)

##### Job source/mock job utilities (LOW–MEDIUM; some are write-capable)

- `apps/api/src/jobs/jobSourceEnforcement.ts` (Prisma types)
- `apps/api/src/jobs/mockJobGuards.ts` (includes bulk cleanup using PrismaClient + deletes)
- `apps/api/src/jobs/mockJobRemoval.ts` (creates `new PrismaClient()` and deletes mock jobs)
- `apps/api/src/services/mockJobRefreshService.ts` (heavy Prisma usage: groupBy/count/create/prune)

##### Scripts (LOW–MEDIUM; operational tooling but must be Prisma-free inside `apps/api`)

- `apps/api/scripts/seedMockJobs.ts` (uses `new PrismaClient()`)
- `apps/api/scripts/runMockJobRefresh.ts` (uses `new PrismaClient()`)

##### Test utilities/tests (LOW; must be Prisma-free per Phase 4 grep rule)

- `apps/api/src/testUtils/seed.ts`
- `apps/api/src/testUtils/testDb.ts`
- `apps/api/src/__tests__/ledgerImmutability.test.ts`

---

### Recommended migration order (risk-driven)

1. **Read-only endpoints & enum-only imports** (safe)
2. **Job state transitions** (`customer-review`, `router-hold`)
3. **Router dispatch writes** (`contractors/dispatch`)
4. **Payout methods + Stripe onboarding** (`payout-methods`)
5. **Ledger writes + escrow reimburse/release** (highest risk)
6. Delete/retire Prisma wrapper (`apps/api/src/db/prisma.ts`) only after all callers are gone.

