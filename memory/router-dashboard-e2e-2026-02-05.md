## Router Dashboard (E2E) — 2026-02-05

### Goal
Implement and verify the Router Dashboard end-to-end: **router login → route job to 1–5 contractors → contractor self-assigns → router sees progress + ETC → notifications + dismiss → earnings → senior progress → support ticket creation**.

### Key rules enforced (locked)
- Routers **route** jobs to **1–5** contractors, never assign.
- Contractors **self-assign** (first-come, first-served).
- Routers are **read-only** after routing/claim.
- No direct messaging to posters/contractors; escalation via **Support** only.

### Implementation highlights
- Router Dashboard UI: `apps/web/src/app/app/router/RoutingWorkspace.tsx`
  - Available Jobs (eligible + route CTA)
  - Routing Workspace modal (eligible contractors, multi-select 1–5, distance rules)
  - Pending Jobs & Progress (read-only, contractor + status + timestamps + ETC)
  - Notifications (system events, dismissible)
  - Payments & Earnings (router-only)
  - Profile + Senior Router progress counter
  - Contact Support (ticket modal)

- Backend routing endpoint (job dispatch creation): `apps/api/app/api/web/router/apply-routing/route.ts`
  - **Dev-only** logs dispatch tokens when `ALLOW_DEV_OTP_ECHO=true` so E2E can simulate contractor accept without email.

- Contractor dispatch response: `apps/api/app/api/contractor/dispatch/respond/route.ts`
  - Accept/decline flow; on accept sets job to first-come assignment.
  - Optional `estimatedCompletionDate` captured (date-only) for router read-only visibility.
  - Fixed Zod validation regex to accept real `YYYY-MM-DD` dates.

- E2E seed script (idempotent): `scripts/seed-router-dashboard-e2e.ts`
  - Creates deterministic router + 5 approved contractors + 1 paid unrouted job.

- E2E completion helper: `scripts/complete-router-dashboard-e2e.ts`
  - Sets job `COMPLETED_APPROVED`, credits router ledger entry (append-only), increments `routesCompleted`.

### Executed E2E flow (verified)
- Seeded deterministic data via `pnpm tsx scripts/seed-router-dashboard-e2e.ts`.
- Logged in as router and routed E2E job to **2** contractors.
- Used dev dispatch token logs to simulate contractor accept and set **ETC = 2026-02-10**.
- Router dashboard showed:
  - Pending job status **Claimed**
  - Contractor name **Austin Handy Pros**
  - ETC displayed
  - Notification: **Job claimed by a contractor**
- Credited router earnings + incremented senior progress via `pnpm tsx scripts/complete-router-dashboard-e2e.ts <jobId>`.
  - Notification: **Earnings available**
  - Earnings history includes `ROUTER_EARNING` entries.
  - Senior progress counter increased.
- Verified notifications are **dismissible** (items disappear after dismiss).
- Created a new support ticket from **Contact Support** modal referencing the E2E job.
  - Notifications include **Support ticket created** and **Support ticket: open**.

### Notes
- Ledger entries are append-only; no deletion in seed scripts.
- Dev token logging is guarded to avoid production exposure.
