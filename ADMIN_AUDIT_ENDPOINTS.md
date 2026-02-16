## ADMIN AUDIT — Endpoint Inventory (Admin UI → API)

This file inventories **what the Admin UI calls** (client → `/api/admin/**`), and where those requests are proxied.

## How admin requests flow

- **Client wrapper**: `apps/admin/src/lib/api.ts` (`apiFetch(...)`)
- **Page/section call sites**: each page listed below calls `apiFetch("/api/admin/...")` directly (or via a local helper in the same page file)
- Next.js API proxy: `apps/admin/app/api/admin/[...path]/route.ts`
  - (Legacy) previously forwarded to API origin (default `http://localhost:3003`) via `apps/admin/src/server/adminApiProxy.ts`
  - Upstream path shape: `/api/admin/<...>`

### Per-page metadata (applies to every section below)

- **Page file path**: shown in the section header (`### Page: ...`)
- **Client call site file path(s)**:
  - `apps/admin/src/lib/api.ts` (shared wrapper)
  - the page file itself (shown in the section header)
- **Upstream target**: (Legacy) proxy via `apps/admin/app/api/admin/[...path]/route.ts` → `<api-origin>/api/admin/...` (served by `apps/api`)

## Pages and calls

### Page: `apps/admin/app/page.tsx` (Dashboard)

Calls:
- **GET** `/api/admin/dashboard`

Expected response shape (referenced in code):
- `jobs.available`, `jobs.assigned`, `jobs.awaitingAssignment`, `jobs.completed`
- `contractors.pendingApproval`, `contractors.active`, `contractors.suspended`
- `money.pendingPayouts`, `money.feesCollected.todayCents`, `money.feesCollected.weekCents`, `money.ledgerWarnings.negativeAvailableCount`
- `alerts.stalledJobsRoutedOver24h`, `alerts.stalledAssignmentsOver72h`, `alerts.failedPayouts`

---

### Page: `apps/admin/app/jobs/page.tsx` (Jobs)

Calls:
- **GET** `/api/admin/jobs?status=<STATUS>&isMock=<true|false>&jobSource=<MOCK|REAL|AI_REGENERATED>&archived=<true|false>`
- **GET** `/api/admin/contractors?status=APPROVED`
- **PATCH** `/api/admin/jobs/:jobId/archive` (body `{}`)
- **POST** `/api/admin/jobs/:jobId/assign` (body `{ contractorId }`)
- **POST** `/api/admin/jobs/:jobId/complete` (no body)

Bulk AI jobs (modal):
- **POST** `/api/admin/bulk-ai-jobs/start`
- **GET** `/api/admin/bulk-ai-jobs/:id/status`
- **POST** `/api/admin/bulk-ai-jobs/:id/cancel`

Expected response shapes (referenced):
- Jobs list: `{ jobs: Job[] }` (many job fields referenced in table)
- Contractors list: `{ contractors: Contractor[] }`
- Bulk AI job status: `BulkAiJob` (fields: `id, kind, status, totalJobs, processedJobs, ...`)

---

### Page: `apps/admin/app/jobs/[id]/page.tsx` (Job detail)

Calls:
- **GET** `/api/admin/jobs` (then client filters for `id`)
- **GET** `/api/admin/contractors?status=<APPROVED|PENDING|REJECTED>`
- **GET** `/api/admin/jobs/:id/holds`
- **POST** `/api/admin/jobs/:id/assign` (body `{ contractorId }`)
- **POST** `/api/admin/jobs/:id/complete` (body `{ override: true, reason }`)
- **POST** `/api/admin/jobs/:id/holds` (create; body varies)
- **POST** `/api/admin/jobs/:id/ai-appraisal` (body `{}`)
- **POST** `/api/admin/jobs/:id/apply-ai-price` (body varies)
- **POST** `/api/admin/jobs/:id/holds` (release/update; body varies)

Expected response shapes (referenced):
- `/jobs/:id/holds`: `{ holds: JobHold[] }`

---

### Page: `apps/admin/app/jobs/status/page.tsx` (Job Status)

Calls:
- **GET** `/api/admin/jobs/status?limit=300`
- **GET** `/api/admin/job-appraisals/pending`
- **POST** `/api/admin/jobs/:jobId/assign-me-as-router`
- **POST** `/api/admin/job-appraisals/:id/complete` (body with appraisal data; expects `{ ok: true, resumeUrl: string }`)

Expected response shapes (referenced):
- `{ jobs: JobRow[] }`
- Pending appraisals: `{ jobs: PendingAppraisalJob[] }`

---

### Page: `apps/admin/app/materials/page.tsx` (Parts & Materials)

Calls:
- **GET** `/api/admin/materials`

Expected response shape (referenced):
- `{ requests: Row[] }`

---

### Page: `apps/admin/app/assignments/page.tsx` (Routing Activity)

Calls:
- **GET** `/api/admin/routing-activity`

Expected response shape (referenced):
- `{ jobs: RoutingActivityJob[] }`

---

### Page: `apps/admin/app/job-drafts/page.tsx` (Job Drafts)

Calls:
- **GET** `/api/admin/job-drafts?status=<STATUS>&q=<query>`
- **POST** `/api/admin/job-drafts` (body is the draft create payload)

Expected response shape (referenced):
- `{ jobDrafts: JobDraft[] }`

---

### Page: `apps/admin/app/job-drafts/[id]/page.tsx` (Job Draft detail)

Calls:
- **GET** `/api/admin/job-drafts/:id` (expects `{ jobDraft }`)
- **PATCH** `/api/admin/job-drafts/:id` (edit payload; expects `{ jobDraft }`)
- **POST** `/api/admin/job-drafts/:id/<path>` where `<path>` is one of:
  - `submit`
  - `needs-clarification`
  - `reject`
- **POST** `/api/admin/job-drafts/:id/publish` (expects `{ jobDraft, job: { id } }`)

Expected response shapes (referenced):
- `{ jobDraft: JobDraft }`
- publish: `{ jobDraft: JobDraft; job: { id: string } }`

---

### Page: `apps/admin/app/contractors/page.tsx` (Supply Contractors)

Calls:
- **GET** `/api/admin/contractors?status=<STATUS>&q=<query>`
- **GET** `/api/admin/jobs?status=ASSIGNED`
- **GET** `/api/admin/jobs?status=COMPLETED_APPROVED`
- **POST** `/api/admin/contractors` (create payload)

Expected response shape (referenced):
- `{ contractors: Contractor[] }`
- jobs: `{ jobs: JobWithAssignment[] }`

---

### Page: `apps/admin/app/contractors/[id]/page.tsx` (Contractor detail)

Calls:
- **GET** `/api/admin/contractors/:id` (expects `{ contractor }`)
- **POST** `/api/admin/contractors/:id/approve` (expects `{ contractor }`)
- **POST** `/api/admin/contractors/:id/reject` (expects `{ contractor }`)
- **GET** `/api/admin/jobs?status=ASSIGNED`
- **GET** `/api/admin/jobs?status=COMPLETED_APPROVED`

Expected response shape (referenced):
- `{ contractor: Contractor }`

---

### Page: `apps/admin/app/payout-requests/page.tsx` (Payout Requests)

Calls:
- **GET** `/api/admin/payout-requests?status=<REQUESTED|PAID|REJECTED|CANCELLED>` (expects `{ payoutRequests }`)
- **POST** `/api/admin/payout-requests/:id/mark-paid` (body `{ externalReference?, notesInternal? }`)

Expected response shape (referenced):
- `{ payoutRequests: PayoutRequest[] }`

---

### Page: `apps/admin/app/ledger/page.tsx` (Ledger)

Calls:
- **GET** `/api/admin/jobs?status=COMPLETED`
- **GET** `/api/admin/payout-requests?status=PAID`

Expected response shapes (referenced):
- `{ jobs: Job[] }`
- `{ payoutRequests: PayoutRequest[] }`

---

### Page: `apps/admin/app/support/page.tsx` (Support Inbox)

Calls:
- **GET** `/api/admin/support/inbox?<filters>`
- **POST** `/api/admin/support/tickets/:ticketId/assign-to-me`

Expected response shape (referenced):
- `{ actorUserId: string; tickets: InboxTicket[] }`

---

### Page: `apps/admin/app/support/tickets/[ticketId]/page.tsx` (Support ticket detail)

Calls:
- **GET** `/api/admin/support/tickets/:ticketId` (expects `{ ticket, messages, attachments }`)
- **POST** `/api/admin/support/tickets/:ticketId/assign-to-me`
- **POST** `/api/admin/support/tickets/:ticketId/status` (body `{ status }`)
- **POST** `/api/admin/support/tickets/:ticketId/reply` (body `{ message, setStatus? }`)

Expected response shape (referenced):
- `{ ticket: Ticket; messages: Message[]; attachments: Attachment[] }`

---

### Page: `apps/admin/app/support/disputes/[disputeId]/page.tsx` (Dispute review)

Calls:
- **GET** `/api/admin/support/disputes/:disputeId` (expects `{ dispute, messages, attachments, job }`)
- **POST** `/api/admin/support/disputes/:disputeId/status` (body `{ status }`)
- **POST** `/api/admin/support/disputes/:disputeId/decision` (body `{ decision, decisionSummary }`)

Expected response shape (referenced):
- `{ dispute: Dispute; messages: Message[]; attachments: Attachment[]; job: JobCtx | null }`

---

### Page: `apps/admin/app/settings/page.tsx` (Settings)

Calls:
- **GET** `/api/admin/settings/mock-refresh` (expects `{ config, configUpdatedAt, regions }`)
- **POST** `/api/admin/settings/mock-refresh` (body `{ enabled, jobsPerCycle, intervalHours }`)

Expected response shape (referenced):
- `{ config: Config; configUpdatedAt: string | null; regions: RegionRow[] }`

---

### Page: `apps/admin/app/audit-logs/page.tsx` (Audit Logs)

Calls:
- **GET** `/api/admin/audit-logs?<filters>`

Expected response shape (referenced):
- `{ auditLogs: AuditLog[] }`

---

### Page: `apps/admin/app/stats/page.tsx` (Stats)

Calls:
- **GET** `/api/admin/stats`

Expected response shape (referenced):
- `contractors.total`, `contractors.approved`
- `jobDrafts.total`
- `jobs.total`, `jobs.open`, `jobs.claimed`, `jobs.routed`, `jobs.assigned`, `jobs.completed`
- `payoutRequests.requested`

---

### Page: `apps/admin/app/admin/users/page.tsx` (Users: All)

Calls:
- **GET** `/api/admin/users?cursor=<cursor>`

Expected response shape (referenced):
- `{ users: UserRow[]; nextCursor: string | null }`

---

### Page: `apps/admin/app/admin/users/contractors/page.tsx` (Users: Contractors)

Calls:
- **GET** `/api/admin/users/contractors?cursor=<cursor>`

Expected response shape (referenced):
- `{ contractors: Row[]; nextCursor: string | null }`

---

### Page: `apps/admin/app/admin/users/routers/page.tsx` (Users: Routers)

Calls:
- **GET** `/api/admin/users/routers?cursor=<cursor>`

Expected response shape (referenced):
- `{ routers: Row[]; nextCursor: string | null }`

---

### Page: `apps/admin/app/admin/users/job-posters/page.tsx` (Users: Job Posters)

Calls:
- **GET** `/api/admin/users/job-posters?cursor=<cursor>`

Expected response shape (referenced):
- `{ jobPosters: Row[]; nextCursor: string | null }`

---

### Page: `apps/admin/app/my/roles/page.tsx` (My Roles)

Calls:
- **GET** `/api/admin/my/roles`

Expected response shape (referenced):
- `{ ok: true; roles: { JOB_POSTER, ROUTER, CONTRACTOR } }` with `termsAccepted/termsAcceptedAt/wizardCompleted/wizardCompletedAt/entityExists`

---

### Page: `apps/admin/app/my/roles/[role]/page.tsx` (My Role onboarding detail)

Calls:
- **GET** `/api/admin/my/roles`
- **POST** `/api/admin/my/roles/:role/accept-terms` (body `{ accepted: true }`)
- **POST** `/api/admin/my/roles/:role/complete` (body depends on role)

Expected response shape (referenced):
- Same as `/api/admin/my/roles` on refresh

---

### Page: `apps/admin/app/ai-email-campaigns/regions/page.tsx`

Calls:
- **GET** `/api/admin/ai-email-campaigns/regions`
- **POST** `/api/admin/ai-email-campaigns/seed`
- **POST** `/api/admin/ai-email-campaigns/regions/:id/pause` (body `{ paused }`)

Expected response shapes (referenced):
- `{ regions: Region[] }`

---

### Page: `apps/admin/app/ai-email-campaigns/drafts/page.tsx`

Calls:
- **GET** `/api/admin/ai-email-campaigns/drafts?<filters>`
- **GET** `/api/admin/ai-email-campaigns/identities`
- **POST** `/api/admin/ai-email-campaigns/drafts/generate` (body `{ contactId }`)
- **POST** `/api/admin/ai-email-campaigns/drafts/:draftId/approve` (body `{ confirmPlaceholder }`)
- **POST** `/api/admin/ai-email-campaigns/drafts/:draftId/reject`
- **POST** `/api/admin/ai-email-campaigns/drafts/:draftId/regenerate`
- **PATCH** `/api/admin/ai-email-campaigns/drafts/:editId` (body includes edits)

Expected response shapes (referenced):
- drafts: `{ drafts: Draft[] }`
- identities: `{ identities: Identity[] }`

---

### Page: `apps/admin/app/ai-agent-pipeline/runs/page.tsx`

Calls:
- **GET** `/api/admin/ai-agent-pipeline/runs` (expects `{ runs }`)
- **POST** `/api/admin/ai-agent-pipeline/plans/:planId/approve`
- **POST** `/api/admin/ai-agent-pipeline/plans/:planId/activate`
- **POST** `/api/admin/ai-agent-pipeline/runs/:runId/skip`

Expected response shape (referenced):
- `{ runs: Run[] }`

---

### Admin app-owned (non-`/api/admin/*`) routes (excluded from this audit)

This audit runner targets **API admin endpoints** (`/api/admin/*`) served by `apps/api`.

The Admin app also implements auth routes like `/api/login` and `/api/logout` inside `apps/admin`,
but they are intentionally **excluded** from this backend endpoint audit scope.

