## Router Dashboard API Inventory (apps/web → apps/api)

This maps **Router** UI actions to:
- **Web app route** (`apps/web`) that calls the API
- **Web proxy API route** (`apps/web/src/app/api/app/router/**`) that forwards to backend
- **Backend API route** (`apps/api/app/api/web/router/**`)
- **Primary tables touched** (best-effort from backend route imports/usage)

### High-risk notes discovered during inventory

- **Silent failure in router feed proxy**: `apps/web/src/app/api/app/router/routable-jobs/route.ts` forces `200 { jobs: [] }` even when upstream fails. This can hide DB failures and create “no jobs” phantom states.

---

### Inventory table

| UI action | Frontend file(s) | Web endpoint | Web proxy route file | Upstream backend endpoint | Backend route file | Tables touched |
|---|---|---|---|---|---|---|
| Open jobs in region (routable list) | `apps/web/src/app/app/router/open-jobs/page.tsx` | `GET /api/app/router/routable-jobs` | `apps/web/src/app/api/app/router/routable-jobs/route.ts` | `GET /api/web/router/routable-jobs` | `apps/api/app/api/web/router/routable-jobs/route.ts` | `Job`, router profile tables |
| Eligible contractors for selected job | `apps/web/src/app/app/router/open-jobs/page.tsx` | `GET /api/app/router/jobs/:jobId/eligible-contractors` | `apps/web/src/app/api/app/router/jobs/[jobId]/eligible-contractors/route.ts` | `GET /api/web/router/jobs/:id/eligible-contractors` | `apps/api/app/api/web/router/jobs/[id]/eligible-contractors/route.ts` | `Contractor`, `contractor_accounts`, `Job` |
| Apply routing (dispatch 1–5 contractors) | `apps/web/src/app/app/router/open-jobs/page.tsx` | `POST /api/app/router/apply-routing` | `apps/web/src/app/api/app/router/apply-routing/route.ts` | `POST /api/web/router/apply-routing` | `apps/api/app/api/web/router/apply-routing/route.ts` | `JobDispatch`, `Job`, `AuditLog` |
| Routing queue (last 24h routed jobs) | `apps/web/src/app/app/router/queue/page.tsx` | `GET /api/app/router/routed-jobs` | `apps/web/src/app/api/app/router/routed-jobs/route.ts` | `GET /api/web/router/routed-jobs` | `apps/api/app/api/web/router/routed-jobs/route.ts` | `JobDispatch`, `Job` |
| Router jobs history | `apps/web/src/app/app/router/jobs/page.tsx` | `GET /api/app/router/jobs` | `apps/web/src/app/api/app/router/jobs/route.ts` | `GET /api/web/router/jobs` | `apps/api/app/api/web/router/jobs/route.ts` | `Job`, dispatch/assignment tables |
| Claim job (router) | router job view | `POST /api/app/router/jobs/:jobId/claim` | `apps/web/src/app/api/app/router/jobs/[jobId]/claim/route.ts` | `POST /api/web/router/jobs/:id/claim` | `apps/api/app/api/web/router/jobs/[id]/claim/route.ts` | `Job`, `AuditLog` |
| Nudge (router) | router job view | `POST /api/app/router/jobs/:jobId/nudge` | `apps/web/src/app/api/app/router/jobs/[jobId]/nudge/route.ts` | `POST /api/web/router/jobs/:id/nudge` | `apps/api/app/api/web/router/jobs/[id]/nudge/route.ts` | `notification_deliveries`, `AuditLog` |
| Router profile | `apps/web/src/app/app/router/profile/page.tsx` | `GET/POST /api/app/router/profile` | `apps/web/src/app/api/app/router/profile/route.ts` | `GET/POST /api/web/router/profile` | `apps/api/app/api/web/router/profile/route.ts` | `RouterProfile`, `Router` |
| Router incentives | `apps/web/src/app/app/router/incentives/page.tsx` | `GET /api/app/router/incentives` | `apps/web/src/app/api/app/router/incentives/route.ts` | `GET /api/web/router-incentives` | `apps/api/app/api/web/router-incentives/route.ts` | payout/earnings tables |
| Router earnings + pending | router pages | `GET /api/app/router/earnings` + `GET /api/app/router/pending-earnings` | `apps/web/src/app/api/app/router/earnings/route.ts` + `apps/web/src/app/api/app/router/pending-earnings/route.ts` | `GET /api/web/router/earnings` + `GET /api/web/router/pending-earnings` | `apps/api/app/api/web/router/earnings/route.ts` + `apps/api/app/api/web/router/pending-earnings/route.ts` | payout/ledger tables |
| Router notifications | router shell | `GET /api/app/router/notifications` + mark-read | `apps/web/src/app/api/app/router/notifications/*/route.ts` | `/api/web/router/notifications*` | `apps/api/app/api/web/router/notifications/*/route.ts` | `notification_deliveries` |
| Router support inbox | `apps/web/src/app/app/router/support-inbox/page.tsx` | `GET /api/app/router/support/inbox` | `apps/web/src/app/api/app/router/support/inbox/route.ts` | `GET /api/web/router/support/inbox` | `apps/api/app/api/web/router/support/inbox/route.ts` | `support_tickets`, `support_messages` |
| Router support ticket detail | router support UI | `GET /api/app/router/support/tickets/:ticketId` | `apps/web/src/app/api/app/router/support/tickets/[ticketId]/route.ts` | `GET /api/web/admin/support/tickets/:id` or router scoped support | `apps/api/app/api/admin/support/tickets/[id]/route.ts` (likely) | support tables |
| Router support ticket status | router support UI | `POST /api/app/router/support/tickets/:ticketId/status` | `apps/web/src/app/api/app/router/support/tickets/[ticketId]/status/route.ts` | upstream support status route | `apps/api/app/api/admin/support/tickets/[id]/...` | support tables |
| Router support ticket assign-to-me | router support UI | `POST /api/app/router/support/tickets/:ticketId/assign-to-me` | `apps/web/src/app/api/app/router/support/tickets/[ticketId]/assign-to-me/route.ts` | upstream assign route | `apps/api/app/api/admin/support/tickets/[id]/assign-to-me/route.ts` | support tables |
| Router support ticket messages | router support UI | `POST /api/app/router/support/tickets/:ticketId/messages` | `apps/web/src/app/api/app/router/support/tickets/[ticketId]/messages/route.ts` | upstream messages route | `apps/api/app/api/admin/support/tickets/[id]/messages/route.ts` | support tables |

