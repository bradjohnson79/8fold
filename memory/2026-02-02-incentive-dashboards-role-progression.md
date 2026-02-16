# 8Fold Local — Incentive Dashboards & Role Progression (Web)

**Date:** 2026-02-02  
**Task:** Contractor + Router dashboard incentives, onboarding gates, progression visibility  
**Status:** ✅ IMPLEMENTED (no payouts, no admin UI changes, no mobile changes)

---

## Key constraints honored

- Auth uses existing **OTP sessions** (`/api/auth/*`), stored in **httpOnly cookies** on the web app.
- Admin app remains separate and unchanged.
- No payout automation and no backend payout logic changes.
- Incentives are **eligibility + visibility** only; **admin approval required** for any reward activation.
- No advertising, URLs, or discovery features.
- Public UI labels use **Job Poster** (internal backend role may differ).

---

## Contractor dashboard updates

### 1) Mandatory waiver gate (blocking)

**Goal:** Contractors cannot receive routed work or act until they accept the waiver.

Implementation:
- New waiver page: `GET /app/contractor/waiver`
  - Placeholder waiver text + checkbox + submit.
- Waiver submit calls: `POST /api/app/contractor/waiver`
  - Proxies to API: `POST /api/web/contractor-waiver`
  - Stores acceptance as an **AuditLog** entry (no schema changes):
    - `action: CONTRACTOR_WAIVER_ACCEPTED`
    - `entityType: Contractor`
    - `entityId: <contractorId>`
    - `actorUserId: <userId>`
    - metadata includes `acceptedAt` and `ip`

Contractor state:
- Derived:
  - **PENDING_WAIVER** = no audit log entry
  - **ACTIVE** (for web gating) = audit log entry exists

### 2) Contractor incentive program (visible)

**Goal:** Complete **10** successful jobs → **$500 bonus** (admin approval required)

Counting rules:
- Only jobs with status `COMPLETED_APPROVED`
- Excludes any jobs with unresolved holds/disputes (`JobHold.status=ACTIVE`)

Data source:
- API computation: `GET /api/web/contractor-incentives`
  - Links authenticated user → Contractor by matching `User.email` to `Contractor.email`
  - Returns:
    - `waiverAccepted`
    - `completedApproved`
    - `eligibleCompletedApproved`
    - incentive object with `progress`, `target=10`, `status`

UI:
- New page: `GET /app/contractor/incentives`
  - Progress bar (not table)
  - Badge states: Locked / In progress / Completed (awaiting admin)
  - Waiver warning banner if waiver not accepted

### 3) Contractor dashboard sections (as required)

Navigation now includes:
- Job assignments
- Messages (shell only)
- Profile
- Incentives
- Overview

---

## Router dashboard updates

### 1) Senior Router Track (visible)

**Goal:** Route **50** successful jobs → “Eligible for Senior Router Moderator Review” (admin approval required)

Successful definition:
- Router claimed/routed job
- Job reaches `COMPLETED_APPROVED`
- No unresolved holds/disputes (`JobHold.status=ACTIVE`)

Data source:
- API computation: `GET /api/web/router-incentives`
  - Returns:
    - `routedTotal`
    - `successfulCompletedApproved`
    - `successfulEligible`
    - `successRatePercent`
    - incentive object with `progress`, `target=50`, `status`

UI:
- New page: `GET /app/router/incentives`
  - Progress bar + badge (Locked / In progress / Eligible awaiting admin)
  - Routing stats blocks:
    - Jobs routed
    - Jobs completed successfully
    - Success rate
  - Benefit summary (UI-only): “Opportunity to earn $250/month…”

### 2) Router dashboard sections (as required)

Navigation now includes:
- Open jobs in region (placeholder)
- Routing queue (placeholder)
- Messages (shell only)
- Earnings overview (placeholder)
- Incentives (NEW)
- Profile
- Overview

---

## Web-only isolation layer (important)

All dashboard data fetches are routed through **web-owned** endpoints under:

- `/api/app/*`

These routes enforce role isolation using the signed role cookie, then proxy to the API with the session token.

New web routes:
- `GET /api/app/router/incentives` → proxies `/api/web/router-incentives`
- `GET /api/app/contractor/incentives` → proxies `/api/web/contractor-incentives`
- `POST /api/app/contractor/waiver` → proxies `/api/web/contractor-waiver`

---

## Backend changes (additive, non-breaking)

Added API endpoints under `apps/api/app/api/web/*`:
- `GET /api/web/router-incentives`
- `GET /api/web/contractor-incentives`
- `POST /api/web/contractor-waiver`

No existing endpoints were removed or renamed.
No payout logic was changed.

---

## Files added/modified (high level)

### Added (web)
- `apps/web/src/components/Progress.tsx` (progress bar + incentive badge)
- `apps/web/src/app/app/contractor/{incentives,waiver,messages}/page.tsx`
- `apps/web/src/app/app/router/{incentives,messages,open-jobs,queue}/page.tsx`
- `apps/web/src/app/api/app/router/incentives/route.ts`
- `apps/web/src/app/api/app/contractor/incentives/route.ts`
- `apps/web/src/app/api/app/contractor/waiver/route.ts`

### Added (api)
- `apps/api/app/api/web/router-incentives/route.ts`
- `apps/api/app/api/web/contractor-incentives/route.ts`
- `apps/api/app/api/web/contractor-waiver/route.ts`

### Modified (web)
- Router/Contractor dashboard nav items updated to include Incentives + Messages placeholders.

---

## Non-goals confirmed (not implemented)

- No automatic payments
- No admin workflow screens
- No role escalation/permission elevation
- No messaging logic
- No mobile changes

