# 8Fold Local — Materials & Parts Escrow System (Web + API)

**Date:** 2026-02-02  
**Task:** Materials/parts request + approval + escrow (Job Poster ↔ Contractor), router read-only  
**Status:** ✅ IMPLEMENTED (no payout automation beyond escrow release timer; no admin UI changes)

---

## Core rules implemented

- Materials requests can be created **only after job is assigned** and while job is:
  - `ASSIGNED` or `IN_PROGRESS`
- Contractor submits factual **parts/materials only** (no labor/markup/estimates).
- Each item requires:
  - name
  - category
  - quantity
  - verified unit price (cents)
  - public URL proving the price
- Job Poster explicitly **approves** or **declines**.
- If approved:
  - materials escrow is funded (tagged MATERIALS via dedicated escrow tables)
  - funds are released to contractor **within 24 hours** (automatic release scheduler)
- If declined:
  - job continues without materials escrow
- Router:
  - read-only visibility
- Materials funds:
  - do **not** affect router fees
  - do **not** affect platform fees
  - do **not** affect incentive calculations
- Completion gate:
  - job cannot reach `COMPLETED_APPROVED` if a materials request is **pending decision** (`SUBMITTED`)

---

## Data models added (Prisma)

Added to `prisma/schema.prisma` (migration created):

- `MaterialsRequest`
  - status: `SUBMITTED | APPROVED | DECLINED`
  - ties to: `jobId`, `contractorId`, `jobPosterUserId`, optional `routerUserId`
  - totals: `totalAmountCents`, `currency`
  - timestamps: submittedAt/approvedAt/declinedAt
- `MaterialsItem`
  - belongs to a request
  - `{ name, category, quantity, unitPriceCents, priceUrl }`
- `MaterialsEscrow`
  - status: `HELD | RELEASED`
  - amount + currency
  - `releaseDueAt`, `releasedAt`
- `MaterialsEscrowLedgerEntry`
  - type: `DEPOSIT | RELEASE`
  - amount + currency
  - memo + optional actor user

Job Poster linkage:
- Added `Job.jobPosterUserId` (nullable for legacy jobs) and `User.jobsPosted`

Migration:
- `prisma/migrations/20260202235634_materials_escrow/`

---

## API routes added (apps/api) — additive, non-breaking

### Materials requests

- `GET /api/web/materials-requests?jobId=...`
  - Returns request + items + escrow (if any)
  - Permission checks:
    - Job Poster: `job.jobPosterUserId === userId`
    - Router: `job.claimedByUserId === userId`
    - Contractor: assignment contractor matches authenticated email

- `POST /api/web/materials-requests`
  - Contractor creates a request
  - Enforces:
    - job status `ASSIGNED|IN_PROGRESS`
    - job has `jobPosterUserId`
    - assignment exists
    - contractor email matches authenticated email
    - waiver accepted (AuditLog `CONTRACTOR_WAIVER_ACCEPTED`)
    - no existing pending request for job

- `POST /api/web/materials-requests/:id/approve`
  - Job Poster approves
  - Creates escrow `HELD` and ledger entry `DEPOSIT`
  - Sets releaseDueAt = approvedAt + 24h

- `POST /api/web/materials-requests/:id/decline`
  - Job Poster declines

### Completion gate

Blocked completion when a materials request is pending (`SUBMITTED`):
- `apps/api/app/api/jobs/[id]/router-approve/route.ts`
- `apps/api/app/api/admin/jobs/[id]/complete/route.ts`

Both return 409 with a clear error message if pending exists.

---

## Web routes/UI added (apps/web)

### Web-owned secure proxies (role gated)

- `POST /api/app/materials/request` (contractor only) → proxies API create
- `GET /api/app/materials/by-job?jobId=...` (router/contractor/job-poster) → proxies API read
- `POST /api/app/materials/:id/approve` (job poster only) → proxies API approve
- `POST /api/app/materials/:id/decline` (job poster only) → proxies API decline

### Pages

- Contractor:
  - `/app/contractor/jobs/[id]/materials` — create/view request
- Job Poster:
  - `/app/job-poster/jobs/[id]/materials` — approve/decline decision UI
- Router:
  - `/app/router/jobs/[id]/materials` — read-only view

UI requirements met:
- pending decision is visually clear (status pills + action buttons on Job Poster view)
- progress bars used elsewhere (not for “game” visuals); neutral/professional tone

---

## Automatic escrow release

Implemented as a scheduler script (run periodically):
- `scripts/materials-escrow-release.ts`
  - Finds `MaterialsEscrow` where `status=HELD` and `releaseDueAt <= now`
  - Marks escrow `RELEASED`
  - Creates `MaterialsEscrowLedgerEntry` type `RELEASE`
  - Writes an `AuditLog` action: `MATERIALS_ESCROW_RELEASED`

This satisfies “release within 24 hours” via cron/scheduler without changing payout logic.

---

## Non-goals confirmed (not implemented)

- No negotiation tools (no chat, no counter-offers)
- No refunds after release
- No router approval
- No vendor purchasing
- No admin UI changes (admin override can be done via DB/API later if needed)

